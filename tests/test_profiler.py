import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from profiler import build_report, finish_cache, model, parse_snapshots
import bridge

CONFIG = """
-gpgpu_n_clusters 2
-gpgpu_n_cores_per_cluster 1
-gpgpu_clock_domains 1000:1000:1000:1000
-gpgpu_shader_core_pipeline 1024:32
-gpgpu_num_sp_units 4
-gpgpu_pipeline_widths 4,4,4,4,4,4,4,4,4,4
-gpgpu_num_sched_per_core 4
-ptx_opcode_initiation_fp 2,2,2,2,4
-gpgpu_n_mem 1
-gpgpu_dram_buswidth 16
-gpgpu_dram_burst_length 2
-dram_data_command_freq_ratio 2
"""


def snapshot(name="first", uid=1, cycles=100, accesses=10, misses=4, pending=2, rd=2):
    return f"""kernel_name = {name}
kernel_launch_uid = {uid}
gpu_sim_cycle = {cycles}
gpu_sim_insn = 320
gpu_ipc = 3.2
gpu_tot_sim_cycle = {100 if uid == 1 else 300}
gpu_occupancy = 50%
L1D_total_cache_accesses = {accesses}
L1D_total_cache_misses = {misses}
L1D_total_cache_pending_hits = {pending}
L1D_total_cache_reservation_fails = 0
DRAM[0]: 16 bks, busW=16 BL=2
n_cmd=100 n_nop=90 n_rd={rd} n_write=1 bw_util=0.03
"""


class ProfilerTests(unittest.TestCase):
    def make_work(self, log, ptx=None, stats=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        work = Path(temporary.name)
        (work / "sim.log").write_text(log)
        (work / "gpgpusim.config").write_text(CONFIG)
        if ptx is not None:
            (work / "test.ptx").write_text(ptx)
        if stats is not None:
            (work / "gpgpu_inst_stats.txt").write_text(stats)
        return work

    def test_measured_flops_and_dram_bytes_use_simulated_time(self):
        work = self.make_work(snapshot(), ".entry first(\nadd.f32 %f1, %f2, %f3;\nfma.rn.f32 %f1, %f2, %f3, %f4;\nadd.u32 %r1, %r2, %r3;\n", "test.ptx 2 : 32 0\ntest.ptx 3 : 32 0\ntest.ptx 4 : 900 0\n")
        r = build_report(work, {"status": "completed", "elapsedSeconds": 900})
        k = r["kernels"][0]
        self.assertEqual(k["fp32Flops"], 96)  # integers are not FLOPs
        self.assertEqual(k["dramBytes"], 96)
        self.assertEqual(k["intensity"], 1)
        self.assertAlmostEqual(k["fp32Gflops"], .96)
        self.assertEqual(r["model"]["peakFp32Gflops"], 256)
        self.assertEqual(r["model"]["peakDramGBs"], 32)
        json.dumps(r, allow_nan=False)

    def test_pending_hits_are_not_direct_hits_and_zero_is_not_missing(self):
        c = finish_cache({"accesses": 10, "misses": 4, "pending": 2})
        self.assertEqual(c["hitRate"], 40)
        self.assertEqual(c["pendingRate"], 20)
        self.assertEqual(c["nonMissRate"], 60)
        self.assertIsNone(finish_cache({"accesses": 0, "misses": 0, "pending": 0})["hitRate"])
        self.assertEqual(finish_cache({"accesses": 5, "misses": 5, "pending": 0})["hitRate"], 0)

    def test_cumulative_counters_are_differenced_and_periodic_snapshots_deduplicated(self):
        log = snapshot(cycles=30, accesses=5) + snapshot() + snapshot("second", 2, 200, 18, 6, 3, 5)
        work = self.make_work(log)
        r = build_report(work)
        self.assertEqual(len(r["kernels"]), 2)
        self.assertEqual(r["kernels"][1]["caches"]["L1D"]["accesses"], 8)
        self.assertEqual(r["kernels"][1]["dramBytes"], 96)
        self.assertEqual(r["kernels"][1]["cycles"], 200)

    def test_zero_dram_and_missing_tlb_do_not_create_fabricated_values(self):
        work = self.make_work(snapshot(rd=0).replace("n_write=1", "n_write=0") + "dram_eff = -nan\n")
        k = build_report(work)["kernels"][0]
        self.assertEqual(k["dramBytes"], 0)
        self.assertEqual(k["tlbs"], {})
        self.assertIsNone(k["intensity"])
        json.dumps(k, allow_nan=False)

    def test_predicated_arithmetic_and_repeated_launches_are_not_falsely_attributed(self):
        work = self.make_work(snapshot(), ".entry first(\n@%p1 fma.rn.f32 %f1, %f2, %f3, %f4;\n", "test.ptx 2 : 32 0\n")
        self.assertIsNone(build_report(work)["kernels"][0]["fp32Flops"])
        (work / "test.ptx").write_text(".entry first(\nfma.rn.f32 %f1, %f2, %f3, %f4;\n")
        (work / "sim.log").write_text(snapshot() + snapshot("first", 2, 200, 18, 6, 3, 5))
        self.assertTrue(all(k["fp32Flops"] is None for k in build_report(work)["kernels"]))

    def test_tlb_extension_requires_complete_consistent_denominator(self):
        work = self.make_work(snapshot() + "l1_tlb_lookup = 10\nl1_tlb_hit = 8\nl1_tlb_miss = 2\nl2_tlb_hit = 9\n")
        tlbs = build_report(work)["kernels"][0]["tlbs"]
        self.assertEqual(tlbs["L1"]["hitRate"], 80)
        self.assertIsNone(tlbs["L2"]["hitRate"])

    def test_multi_kernel_interval_is_labeled_and_cannot_have_individual_roofline(self):
        work = self.make_work(snapshot("first second", "1 2"))
        k = build_report(work)["kernels"][0]
        self.assertEqual(k["scope"], "interval")
        self.assertIsNone(k["intensity"])

    def test_missing_and_reset_counters_remain_unavailable(self):
        work = self.make_work(snapshot() + snapshot("second", 2, 200, 1, 1, 0, 0))
        k = build_report(work)["kernels"][1]
        self.assertIsNone(k["caches"]["L1D"]["hitRate"])
        self.assertIsNone(k["dramBytes"])
        self.assertIsNone(model("")["peakFp32Gflops"])

    def test_profile_reader_checks_paths_and_reads_all_snapshots_beyond_log_tail(self):
        work = self.make_work(snapshot() + ("padding\n" * 30000) + snapshot("second", 2))
        r = bridge.read_profile({"workDir": str(work), "runsRoot": str(work)})
        self.assertEqual(len(r["kernels"]), 2)
        with self.assertRaises(ValueError):
            bridge.read_profile({"workDir": str(work), "runsRoot": str(work / "other")})
        (work / "gpgpu_inst_stats.txt").write_text("../outside.ptx 2 : 32 0\n")
        self.assertIsNone(build_report(work)["kernels"][0]["fp32Flops"])


if __name__ == "__main__":
    unittest.main()

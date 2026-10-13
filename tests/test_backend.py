import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys

SPEC = importlib.util.spec_from_file_location("bridge", Path(__file__).resolve().parents[1] / "backend/bridge.py")
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)
import catalog
import operations
import adapters


class BackendTests(unittest.TestCase):
    def test_independent_gemm_dimensions_and_blocks_apply_to_the_experiment_copy(self):
        source = '#define NI 512\n#define NJ 512\n#define NK 512\n#define DIM_THREAD_BLOCK_X 32\n#define DIM_THREAD_BLOCK_Y 8\ndim3 grid((size_t)(ceil( ((float)NI)/ ((float)block.x) )),(size_t)(ceil( ((float)NJ)/ ((float)block.y) )));'
        generated = bridge.prepare_source(source, 'gemm', 8, parameters={'NI':7,'NJ':13,'NK':5,'DIM_THREAD_BLOCK_X':8,'DIM_THREAD_BLOCK_Y':4})
        self.assertIn('#define NI 7', generated)
        self.assertIn('#define NJ 13', generated)
        self.assertIn('#define NK 5', generated)
        self.assertIn('#define DIM_THREAD_BLOCK_X 8', generated)
        self.assertIn('grid((NJ + block.x - 1) / block.x, (NI + block.y - 1) / block.y)', generated)
        self.assertIn('#define NI 512', source)
        with self.assertRaises(ValueError):
            bridge.prepare_source(source, 'gemm', 8, parameters={'DIM_THREAD_BLOCK_X':64,'DIM_THREAD_BLOCK_Y':64})
        with self.assertRaises(ValueError):
            bridge.prepare_source(source, 'gemm', 8, parameters={'UNKNOWN':16})

    def test_complete_cuda_suite_is_present_in_the_catalog(self):
        self.assertEqual(len(catalog.BENCHMARKS), 15)
        self.assertEqual(set(catalog.BENCHMARKS), {"gemm","mvt","2mm","3mm","2dconv","3dconv","atax","bicg","corr","covar","fdtd2d","gesummv","gramschm","syr2k","syrk"})

    def test_spaced_define_and_fdtd_time_dimension_are_adjusted(self):
        generated = bridge.prepare_source('# define NI 2048\n# define NJ 2048\n# define NK 2048\n# define NL 2048', '2mm', 8, {'kind':'custom','macros':['NI','NJ','NK','NL']})
        self.assertIn('# define NI 8',generated)
        generated = bridge.prepare_source('#define NX 2048\n#define NY 2048\n#define tmax 500','fdtd2d',8)
        self.assertIn('#define tmax 8',generated)

    def test_covariance_grid_covers_small_and_non_block_aligned_sizes(self):
        source='dim3 grid2((size_t)(ceil((float)M) / ((float)DIM_THREAD_BLOCK_KERNEL_2_X)), (size_t)(ceil((float)N) / ((float)DIM_THREAD_BLOCK_KERNEL_2_X)));'
        changed, patches=adapters.compatibility_fixes(source,'covar')
        self.assertNotIn('ceil',changed)
        self.assertIn('(N + DIM_THREAD_BLOCK_KERNEL_2_Y - 1) / DIM_THREAD_BLOCK_KERNEL_2_Y',changed)
        self.assertIn('fix-grid-y-axis:covariance',patches)

    def test_custom_registration_checks_source_and_scale_settings(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/'main.cu').write_text('#define N 16\nint main(){}')
            spec={'name':'My CUDA','file':'main.cu','mode':'macros','macros':['N']}
            descriptor=catalog.validate_registration(spec,root)
            self.assertEqual(descriptor['macros'],['N'])
            with self.assertRaises(ValueError):
                catalog.validate_registration({**spec,'file':'../main.cu'},root)
            with self.assertRaises(ValueError):
                catalog.validate_registration({**spec,'macros':['UNKNOWN']},root)
            with self.assertRaises(ValueError):
                catalog.validate_registration({**spec,'mode':'arguments','args':['16']},root)
            descriptor=catalog.validate_registration({**spec,'mode':'arguments','args':['{size}']},root)
            self.assertEqual(descriptor['args'],['{size}'])

    def test_custom_program_without_checker_is_reported_as_unverified(self):
        parser=bridge.LogParser()
        parser.feed('gpu_tot_sim_cycle = 100')
        parser.feed('GPGPU-Sim: *** exit detected ***')
        self.assertEqual(parser.result(0,allow_unverified=True)['status'],'unverified')
        self.assertEqual(parser.result(0)['status'],'incomplete')

    def test_github_registration_accepts_repository_urls_and_rejects_shell_inputs(self):
        self.assertEqual(catalog.validate_github_url('https://github.com/accel-sim/gpu-app-collection.git'),'https://github.com/accel-sim/gpu-app-collection.git')
        for bad in ['https://example.org/repo','https://github.com/a/b/tree/main','https://user:password@github.com/a/b','file:///tmp/repo']:
            with self.assertRaises(ValueError): catalog.validate_github_url(bad)
        with self.assertRaises(ValueError): catalog.validate_ref('--upload-pack=other')

    def test_changes_all_dimensions_and_preserves_the_original_source(self):
        original = '#define NI 512\n#define NJ 512\n#define NK 512\n#include "../../common/polybenchUtilFuncts.h"\ncudaThreadSynchronize();'
        generated = bridge.prepare_source(original, "gemm", 16)
        for macro in ["NI", "NJ", "NK"]:
            self.assertIn(f"#define {macro} 16", generated)
        self.assertIn("#define NI 512", original)
        self.assertIn("cudaDeviceSynchronize()", generated)

    def test_refuses_unknown_source_layout_instead_of_ignoring_size(self):
        with self.assertRaises(ValueError):
            bridge.prepare_source("#define NI LARGE\n#define NJ 512\n#define NK 512", "gemm", 16)

    def test_cumulative_totals_are_not_added_twice_across_kernels(self):
        parser = bridge.LogParser()
        for line in ["gpu_tot_sim_cycle = 100", "gpu_tot_sim_cycle = 250", "gpu_tot_sim_insn = 1000", "gpu_tot_ipc = 4.0", "Non-Matching CPU-GPU Outputs Beyond Error Threshold of 0.05 Percent: 0", "GPGPU-Sim: *** exit detected ***"]:
            parser.feed(line)
        result = parser.result(0)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["metrics"]["cycles"], 250)

    def test_exit_zero_without_correctness_is_incomplete(self):
        parser = bridge.LogParser()
        parser.feed("gpu_tot_sim_cycle = 100")
        parser.feed("GPGPU-Sim: *** exit detected ***")
        self.assertEqual(parser.result(0)["status"], "incomplete")

    def test_incorrect_and_truncated_results_are_not_successes(self):
        parser = bridge.LogParser()
        parser.feed("gpu_tot_sim_cycle = 500")
        parser.feed("Non-Matching CPU-GPU Outputs Beyond Error Threshold of 0.05 Percent: 3")
        self.assertEqual(parser.result(0)["status"], "incorrect")
        self.assertEqual(parser.result(0, 500)["status"], "limited")

    def test_config_editor_updates_active_value_and_preserves_comments(self):
        text = "# -gpgpu_n_clusters 99\n-gpgpu_n_clusters 108\n"
        changed = bridge.replace_config(text, "-gpgpu_n_clusters", 54)
        self.assertIn("# -gpgpu_n_clusters 99", changed)
        self.assertEqual(bridge.config_value(changed, "-gpgpu_n_clusters"), "54")

    def test_artifact_access_is_confined_to_the_job_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "runs"
            root.mkdir()
            with self.assertRaises(ValueError):
                bridge.read_artifact({"runsRoot": str(root), "workDir": folder, "name": "manifest.json"})


if __name__ == "__main__":
    unittest.main()

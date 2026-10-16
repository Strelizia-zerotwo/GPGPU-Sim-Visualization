import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import cpu
import bridge


class CpuTests(unittest.TestCase):
    def test_allowed_mask_and_smt_order_determine_recommendation(self):
        # IDs are intentionally sparse. 2/6 and 4/8 are SMT sibling pairs.
        def read(path, *args, **kwargs):
            if str(path).endswith("osrelease"):
                return "6.6-microsoft-standard-WSL2"
            number = int(path.as_posix().split("/cpu/cpu")[1].split("/")[0])
            return "0" if path.name == "physical_package_id" else str({2: 0, 6: 0, 4: 1, 8: 1}[number])
        with patch.object(os, "sched_getaffinity", return_value={2, 4, 6, 8}, create=True), \
             patch.object(os, "sched_setaffinity", create=True), patch.object(Path, "read_text", read):
            info = cpu.inspect_cpu()
        self.assertEqual(info["availableCpuIds"], [2, 4, 6, 8])
        self.assertEqual(info["allocationOrder"], [2, 4, 6, 8])
        self.assertEqual(info["visibleCoreCount"], 2)
        self.assertEqual(info["recommendedConcurrency"], 1)
        self.assertTrue(info["isWSL"])

    def test_missing_topology_uses_conservative_fallback(self):
        with patch.object(os, "sched_getaffinity", return_value={1, 3, 5, 7, 9, 11}, create=True), \
             patch.object(os, "sched_setaffinity", create=True), patch.object(Path, "read_text", side_effect=OSError):
            info = cpu.inspect_cpu()
        self.assertIsNone(info["visibleCoreCount"])
        self.assertEqual(info["recommendedConcurrency"], 3)

    @unittest.skipUnless(hasattr(os, "sched_setaffinity"), "Linux affinity required")
    def test_real_child_exec_and_new_threads_inherit_single_cpu_and_disabled_mode_preserves_mask(self):
        allowed = sorted(os.sched_getaffinity(0))
        probe = 'import os,threading,json; t=threading.Thread(target=lambda:print("THREAD="+json.dumps(sorted(os.sched_getaffinity(0))),flush=True)); t.start(); t.join(); print("MAIN="+json.dumps(sorted(os.sched_getaffinity(0))),flush=True)'
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            affinity = {"enabled": True, "cpuId": allowed[-1], "verified": False}
            for enabled in (True, False):
                state = affinity if enabled else {"enabled": False}
                log = root / ("bound.log" if enabled else "unbound.log")
                code = bridge.run_command([sys.executable, "-c", probe], root, dict(os.environ), log,
                                          "running", threading.Event(), time.monotonic() + 20, affinity=state)
                self.assertEqual(code, 0)
                expected = [allowed[-1]] if enabled else allowed
                text = log.read_text()
                for prefix in ("MAIN=", "THREAD="):
                    line = next(line for line in text.splitlines() if line.startswith(prefix))
                    self.assertEqual(json.loads(line[len(prefix):]), expected)
            self.assertTrue(affinity["verified"])
        self.assertEqual(sorted(os.sched_getaffinity(0)), allowed, "parent affinity must stay unchanged")

    @unittest.skipUnless(hasattr(os, "sched_setaffinity"), "Linux affinity required")
    def test_unavailable_cpu_fails_before_launch(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "CPU"):
                bridge.run_command(["this-must-not-launch"], Path(folder), dict(os.environ), Path(folder) / "log",
                                   "running", threading.Event(), time.monotonic() + 5,
                                   affinity={"enabled": True, "cpuId": max(os.sched_getaffinity(0)) + 1})


if __name__ == "__main__":
    unittest.main()

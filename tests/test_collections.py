import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import catalog
from collection_adapters import prepare_collection, collection_arguments


class CollectionTests(unittest.TestCase):
    def test_source_only_downloads_cannot_be_submitted_as_runnable(self):
        with tempfile.TemporaryDirectory() as folder:
            d = catalog.COLLECTIONS["parboil-bfs"]
            marker = catalog.source_location(folder, d)
            marker.parent.mkdir(parents=True)
            marker.write_text("upstream source metadata")
            entry = next(b for b in catalog.catalog(folder) if b["id"] == "parboil-bfs")
            self.assertTrue(entry["downloaded"])
            self.assertFalse(entry["available"])
            self.assertFalse(entry["runnable"])

    def test_download_paths_are_closed_catalog_values_and_keep_suite_structure(self):
        paths = catalog.download_paths(["gemm", "rodinia-3-1-pathfinder", "parboil-bfs"])
        self.assertIn("src/cuda/polybench-gpu-1.0/common", paths)
        self.assertIn("src/cuda/rodinia/3.1/cuda/pathfinder", paths)
        self.assertIn("src/cuda/parboil/benchmarks/bfs", paths)
        with self.assertRaises(ValueError):
            catalog.download_paths(["../arbitrary"])
        for d in catalog.COLLECTIONS.values():
            self.assertTrue(d["sourceDir"].startswith("src/cuda/"))
            self.assertNotIn("..", Path(d["sourceDir"]).parts)
            self.assertEqual(len(d["catalogCommit"]), 40)

    def test_collection_size_templates_and_unknown_layout_fail_closed(self):
        d = catalog.COLLECTIONS["rodinia-3-1-pathfinder"]
        self.assertEqual(collection_arguments(d, 13, d["args"]), ["13", "13", "1"])
        with self.assertRaises(ValueError):
            collection_arguments(d, 13, ["4096", "4096", "200"])
        with self.assertRaises(ValueError):
            prepare_collection("unrecognized upstream source", d)


if __name__ == "__main__":
    unittest.main()

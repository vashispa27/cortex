"""Check that optional cost filtering never hides retrieval or logical-state changes."""
import json
import tempfile
import unittest
from pathlib import Path

from diff_reports import diff, load


class ReportIdentityTests(unittest.TestCase):
    def compare(self, before, after, ignore_files=False):
        with tempfile.TemporaryDirectory() as directory:
            a, b = Path(directory) / "a.json", Path(directory) / "b.json"
            a.write_text(json.dumps(before))
            b.write_text(json.dumps(after))
            return list(diff(load(a, ignore_files), load(b, ignore_files)))

    def test_timing_is_ignored(self):
        self.assertEqual(self.compare({"timing": {"p50": 1}}, {"timing": {"p50": 2}}), [])

    def test_physical_cost_filter_is_explicit(self):
        a = {"index_size": {"vector_shard": {"path": "random-a"}, "state_dir_entries": {"wal": 10}, "sqlite": {"rows": 2}}}
        b = {"index_size": {"vector_shard": {"path": "random-b"}, "state_dir_entries": {"wal": 20}, "sqlite": {"rows": 2}}}
        self.assertTrue(self.compare(a, b))
        self.assertEqual(self.compare(a, b, True), [])

    def test_retrieval_and_parameters_are_never_filtered(self):
        for key, a, b in [("queries", [{"rank": 1}], [{"rank": 2}]),
                          ("meta", {"params": {"dedup_jaccard": 0.9}}, {"params": {"dedup_jaccard": 0}})]:
            self.assertTrue(self.compare({key: a}, {key: b}, True))

    def test_logical_sqlite_state_is_never_filtered(self):
        self.assertTrue(self.compare({"index_size": {"sqlite": {"rows": 2}}},
                                     {"index_size": {"sqlite": {"rows": 3}}}, True))


if __name__ == "__main__":
    unittest.main()

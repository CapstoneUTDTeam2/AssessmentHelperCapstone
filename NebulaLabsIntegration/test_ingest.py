import unittest

from ingest import IngestionError, meeting_values, parse_term, pseudonym, stable_int


class IngestUnitTests(unittest.TestCase):
    def test_pseudonym_is_stable_keyed_and_contains_no_name(self):
        first = pseudonym("source-id", "secret-one")
        self.assertEqual(first, pseudonym("source-id", "secret-one"))
        self.assertNotEqual(first, pseudonym("source-id", "secret-two"))
        self.assertNotIn("Ada", first)

    def test_ids_are_stable_and_namespaced(self):
        self.assertEqual(stable_int("course", "CS 1337"), stable_int("course", "CS 1337"))
        self.assertNotEqual(stable_int("course", "42"), stable_int("section", "42"))

    def test_term_formats(self):
        self.assertEqual(parse_term("25F")[:2], ("Fall", 2025))
        self.assertEqual(parse_term("Spring 2026")[:2], ("Spring", 2026))

    def test_invalid_term_is_rejected(self):
        with self.assertRaises(IngestionError):
            parse_term("winter sometime")

    def test_first_timed_meeting_is_mapped(self):
        days, start, end = meeting_values([
            {"meeting_days": ["Monday", "Wednesday"], "start_time": "9:00 AM", "end_time": "10:15 AM"}
        ])
        self.assertEqual(days, "Monday,Wednesday")
        self.assertEqual(str(start), "09:00:00")
        self.assertEqual(str(end), "10:15:00")


if __name__ == "__main__":
    unittest.main()

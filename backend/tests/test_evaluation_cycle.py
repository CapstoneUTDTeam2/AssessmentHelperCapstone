from datetime import date
from unittest import TestCase

from app.services.evaluation_cycle import (
    evaluation_frequency_years,
    evaluation_status,
    next_due_term,
)


class EvaluationFrequencyTests(TestCase):
    def test_assistant_is_every_calendar_year(self):
        self.assertEqual(evaluation_frequency_years("Assistant Professor"), 1)

    def test_associate_and_full_are_every_two_calendar_years(self):
        self.assertEqual(evaluation_frequency_years("Associate Professor"), 2)
        self.assertEqual(evaluation_frequency_years("Full Professor"), 2)

    def test_unknown_level_has_no_frequency(self):
        self.assertIsNone(evaluation_frequency_years("Lecturer"))


class NextDueTermTests(TestCase):
    def test_assistant_keeps_the_same_semester_next_year(self):
        self.assertEqual(next_due_term(date(2025, 3, 10), 1), (2026, "Spring"))

    def test_associate_keeps_the_same_semester_two_years_later(self):
        self.assertEqual(next_due_term(date(2025, 3, 10), 2), (2027, "Spring"))

    def test_fall_completion_stays_on_the_fall_cycle(self):
        self.assertEqual(next_due_term(date(2026, 10, 15), 1), (2027, "Fall"))


class EvaluationStatusTests(TestCase):
    def test_first_semester_professor_is_not_due(self):
        result = evaluation_status(
            current_year=2025,
            current_semester="Fall",
            current_level="Assistant Professor",
            start_year=2025,
            start_semester="Fall",
        )
        self.assertEqual(result["status"], "Not Due")

    def test_never_evaluated_professor_is_due(self):
        result = evaluation_status(
            current_year=2026,
            current_semester="Fall",
            current_level="Full Professor",
            start_year=2025,
            start_semester="Spring",
        )
        self.assertEqual(result["status"], "Due")

    def test_assistant_is_due_one_year_later_same_semester(self):
        result = evaluation_status(
            current_year=2026,
            current_semester="Spring",
            current_level="Assistant Professor",
            start_year=2024,
            start_semester="Fall",
            last_evaluation_date=date(2025, 3, 10),
        )
        self.assertEqual(result["status"], "Due")
        self.assertEqual(result["frequency_years"], 1)
        self.assertEqual(result["next_due_year"], 2026)
        self.assertEqual(result["next_due_semester"], "Spring")

    def test_assistant_is_overdue_the_following_semester(self):
        result = evaluation_status(
            current_year=2026,
            current_semester="Fall",
            current_level="Assistant Professor",
            start_year=2024,
            start_semester="Fall",
            last_evaluation_date=date(2025, 3, 10),
        )
        self.assertEqual(result["status"], "Overdue")

    def test_associate_is_not_due_one_year_later(self):
        result = evaluation_status(
            current_year=2026,
            current_semester="Spring",
            current_level="Associate Professor",
            start_year=2024,
            start_semester="Fall",
            last_evaluation_date=date(2025, 3, 10),
        )
        self.assertEqual(result["status"], "Not Due")

    def test_full_professor_is_due_two_years_later(self):
        result = evaluation_status(
            current_year=2027,
            current_semester="Spring",
            current_level="Full Professor",
            start_year=2023,
            start_semester="Fall",
            last_evaluation_date=date(2025, 3, 10),
        )
        self.assertEqual(result["status"], "Due")
        self.assertEqual(result["frequency_years"], 2)

    def test_full_professor_is_overdue_after_the_due_semester(self):
        result = evaluation_status(
            current_year=2027,
            current_semester="Fall",
            current_level="Full Professor",
            start_year=2023,
            start_semester="Fall",
            last_evaluation_date=date(2025, 3, 10),
        )
        self.assertEqual(result["status"], "Overdue")

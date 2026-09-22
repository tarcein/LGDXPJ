"""Unit checks for the deterministic text-classification helpers in services.py."""

from __future__ import annotations

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from app.services import classify_lines

_SEOUL = ZoneInfo("Asia/Seoul")


class ClassifyLinesTest(unittest.TestCase):
    def test_supply_due_date_is_parsed_from_the_typed_day_not_todays_date(self):
        # Typed on the 22nd about a supply needed on the 25th — the due date must
        # follow the text, not default to "tomorrow relative to when this was typed".
        reference = datetime(2026, 9, 22, 10, 0, tzinfo=_SEOUL)
        items = classify_lines("25일 현장학습 준비물 도시락이랑 얇은 겉옷", reference=reference)
        self.assertEqual(items[0]["item_type"], "SUPPLY")
        self.assertTrue(items[0]["starts_at"].startswith("2026-09-25"))

    def test_month_and_day_are_both_read_when_given(self):
        reference = datetime(2026, 9, 22, 10, 0, tzinfo=_SEOUL)
        items = classify_lines("10월 3일 준비물 우산", reference=reference)
        self.assertEqual(items[0]["item_type"], "SUPPLY")
        self.assertTrue(items[0]["starts_at"].startswith("2026-10-03"))

    def test_day_only_date_already_passed_this_month_rolls_to_next_month(self):
        reference = datetime(2026, 9, 28, 10, 0, tzinfo=_SEOUL)
        items = classify_lines("5일 준비물 색종이", reference=reference)
        self.assertTrue(items[0]["starts_at"].startswith("2026-10-05"))

    def test_homework_without_any_date_falls_back_to_no_starts_at(self):
        reference = datetime(2026, 9, 22, 10, 0, tzinfo=_SEOUL)
        items = classify_lines("숙제: 수학 문제집", reference=reference)
        self.assertEqual(items[0]["item_type"], "HOMEWORK")
        self.assertNotIn("starts_at", items[0])


if __name__ == "__main__":
    unittest.main()

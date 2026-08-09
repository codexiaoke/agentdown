"""Tests for resumable SSE frame metadata."""

from __future__ import annotations

import unittest

from app.sse import encode_sse_frame


class SseEncodingTest(unittest.TestCase):
    def test_frame_contains_stable_event_id(self) -> None:
        frame = encode_sse_frame(
            {"event": "response.delta", "data": {"content": "hello"}},
            event="response.delta",
            event_id="session:test:7",
        ).decode("utf-8")

        self.assertIn("event: response.delta\n", frame)
        self.assertIn("id: session:test:7\n", frame)
        self.assertTrue(frame.endswith("\n\n"))


if __name__ == "__main__":
    unittest.main()

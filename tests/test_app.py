"""Integration tests for app.py using Streamlit AppTest."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch
from streamlit.testing.v1 import AppTest
from news_crawler import is_safe_url

APP_PATH = str(Path(__file__).parent.parent / "app.py")


def test_app_first_load() -> None:
    """Verify app loads without exceptions and shows initial prompt and checkboxes."""
    at = AppTest.from_file(APP_PATH, default_timeout=15).run()
    assert not at.exception
    assert len(at.title) >= 1
    assert "News Collector" in at.title[0].value
    assert any("Select sites above and click 'Collect headlines'" in info.value for info in at.info)

    labels = [cb.label for cb in at.checkbox]
    assert any("BBC News" in l for l in labels)
    assert any("Hacker News" in l for l in labels)
    assert any("no feed URLs in feeds.json" in l for l in labels)


def test_app_site_selection_synchronization() -> None:
    """Verify Select all and Clear buttons synchronize state and checkboxes."""
    at = AppTest.from_file(APP_PATH, default_timeout=15).run()
    assert not at.exception

    btn_all = [b for b in at.button if b.label == "Select all"][0]
    btn_clear = [b for b in at.button if b.label == "Clear"][0]

    btn_clear.click().run()
    assert not at.exception
    assert len(at.session_state["selected_sites"]) == 0

    btn_all.click().run()
    assert not at.exception
    assert len(at.session_state["selected_sites"]) > 0


def test_app_collect_mock_and_metrics() -> None:
    """Verify mock collect executes properly and updates UI state and metrics."""
    mock_items = [
        {
            "category": "Tech",
            "source": "BBC News",
            "title": "Quantum Computing Milestone",
            "published": "2026-03-01T12:00:00Z",
            "link": "https://bbc.com/quantum",
        }
    ]
    mock_logs = ["OK: BBC News - https://feeds.bbci.co.uk/news/rss.xml (1 items)"]

    with patch("news_crawler.collect", return_value=(mock_items, mock_logs)):
        at = AppTest.from_file(APP_PATH, default_timeout=15).run()
        assert not at.exception

        collect_buttons = [b for b in at.button if "Collect headlines" in b.label]
        assert len(collect_buttons) >= 1
        collect_buttons[0].click().run()

        assert not at.exception
        assert len(at.metric) >= 3
        assert at.metric[0].value == 1 or at.metric[0].value == "1"


def test_ssrf_url_validation() -> None:
    """Verify SSRF defense blocks loopback, cloud metadata, and dangerous schemes."""
    assert not is_safe_url("http://127.0.0.1/status")
    assert not is_safe_url("http://localhost:8080/api")
    assert not is_safe_url("http://[::1]/secret")
    assert not is_safe_url("http://169.254.169.254/latest/meta-data")
    assert not is_safe_url("file:///etc/passwd")
    assert not is_safe_url("javascript:alert(1)")
    assert not is_safe_url("")
    assert not is_safe_url(None)  # type: ignore

"""Smoke tests for app.py using Streamlit AppTest framework."""

from pathlib import Path
from unittest.mock import patch
from streamlit.testing.v1 import AppTest

APP_PATH = str(Path(__file__).parent.parent / "app.py")


def test_app_first_load():
    """Verify app loads without exceptions and shows initial prompt and checkboxes."""
    at = AppTest.from_file(APP_PATH, default_timeout=15).run()
    assert not at.exception

    # Check for title
    assert len(at.title) >= 1
    assert "News Collector" in at.title[0].value

    # Check for the initial instruction
    assert any("Select sites above and click 'Collect headlines'" in info.value for info in at.info)

    # Check that checkboxes for sites exist
    labels = [cb.label for cb in at.checkbox]
    assert any("BBC News" in l for l in labels)
    assert any("Hacker News" in l for l in labels)
    assert any("no feed URLs in feeds.json" in l for l in labels)


def test_app_collect_mock():
    """Verify mock collect executes properly and updates UI state."""
    mock_items = [
        {
            "category": "Tech",
            "source": "BBC News",
            "title": "Quantum Leap Announced",
            "published": "2026-03-01T12:00:00Z",
            "link": "https://bbc.com/quantum",
        }
    ]
    mock_logs = ["OK: BBC News - https://feeds.bbci.co.uk/news/rss.xml (1 items)"]

    with patch("news_crawler.collect", return_value=(mock_items, mock_logs)):
        at = AppTest.from_file(APP_PATH, default_timeout=15).run()
        assert not at.exception

        # Find collect button
        collect_buttons = [b for b in at.button if "Collect headlines" in b.label]
        assert len(collect_buttons) >= 1
        # Click collect
        collect_buttons[0].click().run()

        assert not at.exception
        # Verify metrics or dataframes are now present
        assert len(at.metric) >= 3
        # Metrics: Total Headlines, Sites with Data, Sites with Issues
        assert at.metric[0].value == 1 or at.metric[0].value == "1"

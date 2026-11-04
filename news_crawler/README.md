# News Collector App

A functional news headlines collector with a four-step workflow:
1. **Choose sites**: Checkboxes from `feeds.json` with feed counts.
2. **Collect**: Single-click collection of headlines from selected sites.
3. **Preview**: Tabular preview with site status, category counts, search keywords, and date filters.
4. **Download**: In-memory downloads for CSV, JSON, and Excel matching the filtered view.

## Quickstart (Streamlit)

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Running Tests

```bash
pytest tests/
```

## Adding a Site

To add a new site:
1. Open `feeds.json`.
2. Add a new key for the site name and a list of RSS/Atom feed URLs:
   ```json
   "Wired": [
     "https://www.wired.com/feed/rss"
   ]
   ```
3. Restart or refresh the app. Sites with empty URL lists (`[]`) are automatically shown disabled with `"no feed URLs in feeds.json"`.

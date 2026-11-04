"""News Collector Streamlit App.

How to run:
    pip install -r requirements.txt
    streamlit run app.py
"""

from __future__ import annotations

import datetime
from pathlib import Path
from typing import Any
import pandas as pd
import streamlit as st

import news_crawler
from pages_data import (
    apply_filters,
    category_counts,
    load_site_catalog,
    safe_link,
    selected_feeds,
    site_summary,
    to_csv_bytes,
    to_dataframe,
    to_excel_bytes,
    to_json_bytes,
)

# Session state keys
KEY_RAW_ITEMS = "raw_items"
KEY_RUN_LOG = "run_log"
KEY_LAST_COLLECTED_SITES = "last_collected_sites"
KEY_SELECTED_SITES = "selected_sites"
KEY_FEEDS_PATH = "feeds.json"

st.set_page_config(page_title="News Collector", layout="wide")
st.title("News Collector")
st.write("Collect, preview, and download news headlines from curated RSS feeds.")
st.caption("For personal use. Check each publisher's terms before sharing headlines.")

# Catalog loading (cached to avoid disk reads on every rerun)
catalog_path = Path(KEY_FEEDS_PATH)
catalog = load_site_catalog(catalog_path)
catalog_error = not catalog_path.exists() or not catalog

if catalog_error:
    st.error("Error: `feeds.json` is missing or invalid. Please provide a valid feeds.json file.")

# State initialization
if KEY_RAW_ITEMS not in st.session_state:
    st.session_state[KEY_RAW_ITEMS] = None
if KEY_RUN_LOG not in st.session_state:
    st.session_state[KEY_RUN_LOG] = []
if KEY_LAST_COLLECTED_SITES not in st.session_state:
    st.session_state[KEY_LAST_COLLECTED_SITES] = None
if KEY_SELECTED_SITES not in st.session_state:
    default_sites = [s for s, urls in catalog.items() if urls] if not catalog_error else []
    st.session_state[KEY_SELECTED_SITES] = default_sites
    for s in catalog:
        st.session_state[f"site_{s}"] = s in default_sites

# Step 1: Choose sites
st.markdown("### Step 1: Choose sites")
col_actions, col_delay = st.columns([2, 1])

with col_actions:
    btn_all, btn_clear, _ = st.columns([1, 1, 3])
    if btn_all.button("Select all"):
        all_sites = [s for s, urls in catalog.items() if urls]
        st.session_state[KEY_SELECTED_SITES] = all_sites
        for s in catalog:
            st.session_state[f"site_{s}"] = bool(catalog[s])
        st.rerun()

    if btn_clear.button("Clear"):
        st.session_state[KEY_SELECTED_SITES] = []
        for s in catalog:
            st.session_state[f"site_{s}"] = False
        st.rerun()

with col_delay:
    delay_val = st.slider("Delay between feeds (seconds)", min_value=0.0, max_value=5.0, value=1.0, step=0.5)

# Render checkboxes synced via session state keys
checkbox_cols = st.columns(3)
new_selected: list[str] = []

for idx, (site, urls) in enumerate(catalog.items()):
    col = checkbox_cols[idx % 3]
    feed_count = len(urls)
    key = f"site_{site}"

    if key not in st.session_state:
        st.session_state[key] = site in st.session_state[KEY_SELECTED_SITES]

    with col:
        if feed_count == 0:
            st.checkbox(f"{site} (no feed URLs in feeds.json)", value=False, disabled=True, key=f"disabled_{site}")
        else:
            if st.checkbox(f"{site} ({feed_count} feed{'s' if feed_count > 1 else ''})", key=key):
                new_selected.append(site)

st.session_state[KEY_SELECTED_SITES] = new_selected

# Step 2: Collect
st.markdown("### Step 2: Collect")
active_feeds_dict = selected_feeds(catalog, new_selected)
can_collect = bool(active_feeds_dict) and not catalog_error

if (
    st.session_state[KEY_LAST_COLLECTED_SITES] is not None
    and set(new_selected) != set(st.session_state[KEY_LAST_COLLECTED_SITES])
):
    st.warning("Site selection changed. Collect again to update the data.")

if st.button("Collect headlines", disabled=not can_collect, type="primary"):
    progress_bar = st.progress(0.0)
    status_text = st.empty()

    def on_progress(done: int, total: int, msg: str) -> None:
        progress_bar.progress(min(float(done) / max(total, 1), 1.0))
        status_text.text(msg)

    try:
        with st.spinner("Fetching headlines in worker pool..."):
            items, run_log = news_crawler.collect(
                feeds=active_feeds_dict,
                delay=float(delay_val),
                progress=on_progress,
            )
    except Exception as exc:
        st.error(f"Collection failed: {exc}")
    else:
        st.session_state[KEY_RAW_ITEMS] = items
        st.session_state[KEY_RUN_LOG] = run_log
        st.session_state[KEY_LAST_COLLECTED_SITES] = list(new_selected)
        progress_bar.progress(1.0)
        status_text.text(f"Collection complete: {len(items)} headlines gathered.")

# Step 3: Preview
st.markdown("### Step 3: Preview")
raw_items = st.session_state[KEY_RAW_ITEMS]

if raw_items is None:
    st.info("Select sites above and click 'Collect headlines' to begin.")
else:
    run_log = st.session_state[KEY_RUN_LOG]
    summary_data = site_summary(run_log, catalog)

    m1, m2, m3 = st.columns(3)
    m1.metric("Total Headlines", len(raw_items))
    m2.metric("Sites with Data", len({item["source"] for item in raw_items if item.get("source")}))
    m3.metric("Sites with Issues", sum(1 for s in summary_data if s["status"] in ("FAILED", "PARTIAL")))

    st.markdown("#### Site Status")
    st.dataframe(pd.DataFrame(summary_data), use_container_width=True)

    if not raw_items:
        st.warning("No headlines collected. Check feeds in feeds.json.")
    else:
        full_df = to_dataframe(raw_items)

        # Filters
        st.markdown("#### Filter Headlines")
        f1, f2, f3 = st.columns(3)
        with f1:
            sel_cat = st.multiselect("Category", options=sorted(list(full_df["category"].dropna().unique())))
        with f2:
            search_text = st.text_input("Title Search", placeholder="Filter keywords...")
        with f3:
            valid_dates = full_df["published"].dropna()
            min_d = valid_dates.min().date() if not valid_dates.empty else datetime.date.today()
            max_d = valid_dates.max().date() if not valid_dates.empty else datetime.date.today()
            date_range = st.date_input("Date Range", value=(), min_value=min_d, max_value=max(min_d, max_d))

        d_from, d_to = (date_range if isinstance(date_range, tuple) and len(date_range) == 2 else (None, None))
        filtered_df = apply_filters(full_df, categories=sel_cat or None, text=search_text or None, date_from=d_from, date_to=d_to)

        if "published" in filtered_df.columns:
            filtered_df = filtered_df.sort_values(by="published", ascending=False, na_position="last")

        st.caption(f"Showing {len(filtered_df)} of {len(full_df)} headlines")

        if filtered_df.empty:
            st.warning("No headlines match the filters.")
        else:
            display_df = filtered_df.copy()
            # Clean invalid links so LinkColumn doesn't render broken targets
            display_df["link"] = display_df["link"].apply(lambda u: safe_link(str(u)) if safe_link(str(u)) else None)

            st.dataframe(
                display_df,
                column_config={"link": st.column_config.LinkColumn("Link", display_text="Open Article")},
                use_container_width=True,
            )

            st.markdown("#### Category Breakdown")
            cat_df = category_counts(filtered_df)
            c_chart, c_tbl = st.columns([2, 1])
            with c_chart:
                if not cat_df.empty:
                    st.bar_chart(cat_df.set_index("category"))
            with c_tbl:
                st.dataframe(cat_df, use_container_width=True)

        # Step 4: Download
        st.markdown("### Step 4: Download")
        now_str = datetime.datetime.now().strftime("%Y%m%d-%H%M")
        row_count = len(filtered_df)

        d1, d2, d3 = st.columns(3)
        with d1:
            st.download_button(f"Download CSV ({row_count} rows)", to_csv_bytes(filtered_df), f"headlines_{now_str}.csv", "text/csv")
        with d2:
            st.download_button(f"Download JSON ({row_count} rows)", to_json_bytes(filtered_df), f"headlines_{now_str}.json", "application/json")
        with d3:
            st.download_button(
                f"Download Excel ({row_count} rows)",
                to_excel_bytes(filtered_df, summary_data),
                f"headlines_{now_str}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

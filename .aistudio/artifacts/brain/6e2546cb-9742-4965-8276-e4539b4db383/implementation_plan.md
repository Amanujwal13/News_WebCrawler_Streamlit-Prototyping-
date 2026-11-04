# Minimal Landing Page & News Collector Integration Plan

A unified, single-page experience combining a modern, minimalist marketing hero on top with the full-featured, functional News Collector workspace below.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the Phase 1 clarification interview:
> - **Page Architecture**: Single-page structure with the minimal landing hero and features overview on top, flowing seamlessly down into the interactive Collector workspace below.
> - **Copywriting & Branding**: Tailored specifically to the News Collector, replacing placeholder template text with sharp, concise news aggregation value propositions while retaining the clean "Minimal" aesthetic and `CanvasText` dynamic branding.
> - **Navigation Flow**: The sticky top bar provides direct jump links (`Features`, `Collector Workspace`, `Python Engine`, `Pytest Suite`) and a primary "Get Started" CTA that smoothly scrolls directly to Step 1 of collection.

---

## 1. Overview & Core Concept

- **What It Delivers**: A high-impact product landing page that immediately explains the value of curated RSS aggregation, followed immediately by the fully working 4-step collector tool, Python codebase inspector, and test execution engine.
- **Target Audience**: Researchers, journalists, analysts, and developers who need automated, polite headline collection across major news outlets without web-scraping blocks, ads, or paywall popups.
- **Key Value**: Provides an authoritative, production-grade first impression and allows immediate, zero-friction usage on the exact same page.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Landing & Orientation**:
   - User lands on a clean, minimal white canvas (`bg-white` with zinc/stone accents).
   - Sticky navbar provides quick navigation: `Features`, `Collector`, `Code & Tests`, with an active "Get Started" button.
   - The Hero features a subtle live badge (`v2.0 Curated Feeds Engine`), an impactful headline with the animated `CanvasText` element, and dual action buttons:
     - Primary: **Collect Headlines Free** (smooth scrolls to `#collector`).
     - Secondary: **Inspect Python Code** (switches to the Python engine tab).
2. **Feature Highlights**:
   - Concise value proposition: *Polite Rate Limiting*, *Real-time UTC Normalization*, *Multi-format Export (CSV, JSON, Excel)*, and *SSRF-Safe In-Memory Architecture*.
3. **Interactive Workspace (Below the Fold)**:
   - Step 1: Choose sites from `feeds.json` with select all/clear controls.
   - Step 2: Centered collect button with `LoaderOne` animated wave feedback.
   - Step 3: Real-time preview with headline search, date range filtering, and site health metrics.
   - Step 4: Multi-format download with in-memory byte generation.
   - Switchable inspection view for `app.py`, `news_crawler.py`, `pages_data.py`, and the 100% green `pytest` suite.

### Visual Identity & Theme
- **Canvas & Surface Palette**: Minimalist zinc monochrome palette (`bg-white` canvas, `zinc-50` subtle feature panels, `zinc-200` hairline dividers, `zinc-900` high-contrast interactive buttons and badges).
- **Typography & Scale**: Crisp geometric sans font hierarchy (`text-4xl md:text-6xl font-extrabold tracking-tight` for hero display with `text-wrap: balance`, `15px-16px` high-legibility body prose, `font-mono tabular-nums` for feed metrics and counters).
- **Motion & Interaction**: Eased scroll-reveal pop-ups (`whileInView`), smooth interactive hover scaling on CTAs (`scale: 1.02`), and the floating `ArrowUp` back-to-top button.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Single-Page Flow vs. Multi-Route Navigation**
  - *Chosen Approach*: Single-page vertical flow with smooth scroll anchors.
  - *Why*: Eliminates navigation friction and allows visitors to transition from reading the proposition to collecting live headlines in one fluid motion without page reloads.
  - *Alternative Considered*: Route-based tab separation (rejected per user preference for unified layout).

- **Decision 2: Preserving Complete Application State & Handlers**
  - *Chosen Approach*: Keep all state (`catalog`, `selectedSites`, `rawItems`, `runLog`, `testOutput`, `delay`) and API calls intact.
  - *Why*: Ensures 100% functional continuity; no features are degraded or converted into static mockups.

---

## 4. Technical Architecture & System Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Minimal Navbar (Sticky)                         │
│  [M] News Collector  ·  Features  ·  Collector  ·  Code  ·  [Get Started]│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                              Hero Section                              │
│         [● v2.0 Curated Feeds Engine]                                  │
│         Aggregated Headlines with CanvasText Clarity                   │
│         [Collect Headlines Free]      [Inspect Python Code]            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                        Features Overview Section                       │
│    Zero Scraping Hassle  ·  Polite Delays  ·  Multi-Format Export      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Collector Workspace (#collector)                    │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │ Step 1: Choose Sites (Checkboxes, Select All, Add Site)      │     │
│   ├──────────────────────────────────────────────────────────────┤     │
│   │ Step 2: Collect (Centered Button with LoaderOne)             │     │
│   ├──────────────────────────────────────────────────────────────┤     │
│   │ Step 3: Preview (Metrics, Filter Bar, Headline Table)        │     │
│   ├──────────────────────────────────────────────────────────────┤     │
│   │ Step 4: Download (In-Memory CSV, JSON, Excel)                │     │
│   └──────────────────────────────────────────────────────────────┘     │
│   Tabbed Views: [Collector App]  [Python Code & Tests]  [Run Log]      │
└────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
- `Navbar`: Contains working smooth scroll links to `#features`, `#collector`, and the Python code tab.
- `Hero`: Primary CTA triggers `#collector` jump; secondary CTA activates the `python_code` tab.
- `App.tsx`: Manages active tabs, full collection lifecycle, feed health status calculation, and export handling.
- `server.ts`: Backend proxy serving `/api/catalog`, `/api/collect`, `/api/python-files`, and `/api/run-tests`.

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { LoaderOne } from '@/components/ui/loader';
import { CanvasText, CanvasTextDemo } from '@/components/ui/canvas-text';

export function LoaderOneDemo() {
  return <LoaderOne />;
}

export { CanvasTextDemo };

import {
  Download,
  RefreshCw,
  Sliders,
  CheckSquare,
  Square,
  Search,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Database,
  Code2,
  Terminal,
  Plus,
  Play,
  Layers,
  Calendar,
  X,
  ArrowUp,
  ArrowRight
} from 'lucide-react';

interface Catalog {
  [site: string]: string[];
}

interface HeadlineItem {
  category: string;
  source: string;
  title: string;
  published: string;
  link: string;
}

interface SiteSummaryRow {
  site: string;
  feeds: number;
  status: 'OK' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'NO FEEDS' | 'NOT RUN';
  note: string;
}

function safeLink(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
}

function computeSiteSummary(runLog: string[], catalog: Catalog): SiteSummaryRow[] {
  return Object.entries(catalog).map(([site, urls]) => {
    const feedCount = urls.length;
    if (feedCount === 0) {
      return {
        site,
        feeds: 0,
        status: 'NO FEEDS',
        note: 'no feed URLs in feeds.json',
      };
    }

    const siteLogs = runLog.filter(line => line.includes(`${site} -`) || line.includes(`: ${site}`));
    if (siteLogs.length === 0) {
      return {
        site,
        feeds: feedCount,
        status: 'NOT RUN',
        note: 'Not run',
      };
    }

    const firstLog = siteLogs[0];
    const note = firstLog.includes(': ') ? firstLog.split(': ').slice(1).join(': ') : firstLog;

    const hasOk = siteLogs.some(l => l.startsWith('OK:'));
    const hasWarn = siteLogs.some(l => l.startsWith('WARN:'));
    const hasFail = siteLogs.some(l => l.startsWith('FAIL:'));
    const hasSkip = siteLogs.some(l => l.startsWith('SKIP:'));

    const success = hasOk || hasWarn;
    let status: SiteSummaryRow['status'] = 'OK';
    if (hasFail && success) {
      status = 'PARTIAL';
    } else if (hasFail && !success) {
      status = 'FAILED';
    } else if (hasSkip && !success && !hasFail) {
      status = 'SKIPPED';
    } else {
      status = 'OK';
    }

    return {
      site,
      feeds: feedCount,
      status,
      note,
    };
  });
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>({});
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [lastCollectedSites, setLastCollectedSites] = useState<string[] | null>(null);
  const [delay, setDelay] = useState<number>(3);
  const [isCollecting, setIsCollecting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number; msg: string } | null>(null);

  const [rawItems, setRawItems] = useState<HeadlineItem[] | null>(null);
  const [runLog, setRunLog] = useState<string[]>([]);

  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchText, setSearchText] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // View tabs
  const [activeTab, setActiveTab] = useState<'app' | 'python_code' | 'logs'>('app');
  const [pythonFiles, setPythonFiles] = useState<Record<string, string>>({});
  const [activePythonFile, setActivePythonFile] = useState<string>('app.py');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);

  // New site modal
  const [showAddSiteModal, setShowAddSiteModal] = useState<boolean>(false);
  const [newSiteName, setNewSiteName] = useState<string>('');
  const [newSiteUrls, setNewSiteUrls] = useState<string>('');

  // Scroll to top state for fade-popup button
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 240);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Shared scroll fade pop-up variant
  const fadeInUpVariant = {
    hidden: { opacity: 0, y: 32, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.48,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  // Load catalog on mount
  useEffect(() => {
    fetch('/api/catalog')
      .then(res => res.json())
      .then(data => {
        if (data && data.catalog) {
          setCatalog(data.catalog);
          // Initial selection: all sites with >= 1 feed URL
          const available = Object.entries(data.catalog)
            .filter(([, urls]) => Array.isArray(urls) && urls.length > 0)
            .map(([s]) => s);
          setSelectedSites(available);
        }
      })
      .catch(err => console.error('Failed to load catalog:', err));

    fetch('/api/python-files')
      .then(res => res.json())
      .then(data => {
        if (data && data.files) {
          setPythonFiles(data.files);
        }
      })
      .catch(err => console.error('Failed to load python files:', err));
  }, []);

  // Handle select all and clear
  const handleSelectAll = () => {
    const validSites = Object.entries(catalog)
      .filter(([, urls]) => urls.length > 0)
      .map(([s]) => s);
    setSelectedSites(validSites);
  };

  const handleClear = () => {
    setSelectedSites([]);
  };

  const handleToggleSite = (site: string) => {
    if (selectedSites.includes(site)) {
      setSelectedSites(selectedSites.filter(s => s !== site));
    } else {
      setSelectedSites([...selectedSites, site]);
    }
  };

  const scrollToCollector = () => {
    setActiveTab('app');
    const el = document.getElementById('collector');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Run collection
  const handleCollect = async () => {
    if (selectedSites.length === 0) return;
    setIsCollecting(true);
    setProgress({ done: 0, total: 1, msg: 'Starting collection...' });

    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_sites: selectedSites,
          delay: delay,
        }),
      });

      const data = await res.json();
      setRawItems(data.items || []);
      setRunLog(data.run_log || []);
      setLastCollectedSites([...selectedSites]);
      setProgress(null);
    } catch (err: any) {
      console.error('Collection failed:', err);
      setRunLog(prev => [...prev, `FAIL: Network error during collection (${err.message})`]);
      setProgress(null);
    } finally {
      setIsCollecting(false);
    }
  };

  // Check if selection changed since last run
  const hasSelectionChanged = useMemo(() => {
    if (!lastCollectedSites) return false;
    if (lastCollectedSites.length !== selectedSites.length) return true;
    const setA = new Set(lastCollectedSites);
    return selectedSites.some(s => !setA.has(s));
  }, [lastCollectedSites, selectedSites]);

  // Site summary
  const summaryData = useMemo(() => {
    return computeSiteSummary(runLog, catalog);
  }, [runLog, catalog]);

  // Categories list
  const availableCategories = useMemo(() => {
    if (!rawItems) return [];
    const set = new Set<string>();
    rawItems.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [rawItems]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    if (!rawItems) return [];
    return rawItems.filter(item => {
      // Category filter
      if (selectedCategories.length > 0 && !selectedCategories.includes(item.category)) {
        return false;
      }
      // Text search
      if (searchText.trim()) {
        const query = searchText.trim().toLowerCase();
        if (!item.title.toLowerCase().includes(query)) {
          return false;
        }
      }
      // Date filter
      if (dateFrom || dateTo) {
        if (!item.published) return false;
        const parsed = new Date(item.published);
        if (isNaN(parsed.getTime())) return false;
        const isoDate = parsed.toISOString().slice(0, 10);
        if (dateFrom && isoDate < dateFrom) return false;
        if (dateTo && isoDate > dateTo) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = new Date(a.published).getTime() || 0;
      const db = new Date(b.published).getTime() || 0;
      return db - da; // newest first
    });
  }, [rawItems, selectedCategories, searchText, dateFrom, dateTo]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach(item => {
      const cat = item.category || 'Uncategorized';
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredItems]);

  // Metrics
  const sitesWithDataCount = useMemo(() => {
    if (!rawItems) return 0;
    return new Set(rawItems.map(i => i.source)).size;
  }, [rawItems]);

  const sitesWithIssuesCount = useMemo(() => {
    return summaryData.filter(s => s.status === 'FAILED' || s.status === 'PARTIAL').length;
  }, [summaryData]);

  // In-memory Download handlers
  const getTimestamp = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  };

  const handleDownloadCsv = () => {
    if (filteredItems.length === 0) return;
    const header = ['category', 'source', 'title', 'published', 'link'];
    const rows = filteredItems.map(item => [
      `"${(item.category || '').replace(/"/g, '""')}"`,
      `"${(item.source || '').replace(/"/g, '""')}"`,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.published || '').replace(/"/g, '""')}"`,
      `"${(safeLink(item.link) || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `headlines_${getTimestamp()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (filteredItems.length === 0) return;
    const exportList = filteredItems.map(item => ({
      category: item.category,
      source: item.source,
      title: item.title,
      published: item.published ? new Date(item.published).toISOString() : null,
      link: safeLink(item.link) || '',
    }));
    const jsonStr = JSON.stringify(exportList, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `headlines_${getTimestamp()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = () => {
    if (filteredItems.length === 0) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: headlines
    const headlinesData = filteredItems.map(i => ({
      category: i.category,
      source: i.source,
      title: i.title,
      published: i.published,
      link: safeLink(i.link) || '',
    }));
    const wsHeadlines = XLSX.utils.json_to_sheet(headlinesData);
    wsHeadlines['!cols'] = [
      { wch: 18 },
      { wch: 18 },
      { wch: 65 }, // Title width >= 60 characters
      { wch: 25 },
      { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, wsHeadlines, 'headlines');

    // Sheet 2: sites summary
    const sitesData = summaryData.map(s => ({
      site: s.site,
      feeds: s.feeds,
      status: s.status,
      note: s.note,
    }));
    const wsSites = XLSX.utils.json_to_sheet(sitesData);
    wsSites['!cols'] = [
      { wch: 24 },
      { wch: 10 },
      { wch: 14 },
      { wch: 55 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSites, 'sites');

    XLSX.writeFile(wb, `headlines_${getTimestamp()}.xlsx`);
  };

  // Run live pytest test suite
  const handleRunPytest = async () => {
    setIsRunningTests(true);
    setTestOutput('Running pytest tests/ -v ...');
    try {
      const res = await fetch('/api/run-tests', { method: 'POST' });
      const data = await res.json();
      setTestOutput(data.output || 'Completed with no output.');
    } catch (err: any) {
      setTestOutput(`Error running tests: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Add new site to feeds.json
  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    const urls = newSiteUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('http://') || u.startsWith('https://'));

    const updated = {
      ...catalog,
      [newSiteName.trim()]: urls,
    };

    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog: updated }),
      });
      if (res.ok) {
        setCatalog(updated);
        setSelectedSites(prev => [...prev, newSiteName.trim()]);
        setShowAddSiteModal(false);
        setNewSiteName('');
        setNewSiteUrls('');
      }
    } catch (err) {
      console.error('Failed to save new site:', err);
    }
  };

  const getStatusBadge = (status: SiteSummaryRow['status']) => {
    switch (status) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            OK
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            PARTIAL
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            FAILED
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <AlertCircle className="w-3.5 h-3.5 text-stone-400" />
            SKIPPED
          </span>
        );
      case 'NO FEEDS':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <AlertCircle className="w-3.5 h-3.5 text-stone-400" />
            NO FEEDS
          </span>
        );
      case 'NOT RUN':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-400">
            NOT RUN
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-teal-nebula text-slate-100 font-sans selection:bg-[#23b0b8]/40 selection:text-white antialiased pb-20">
      {/* 1. MINIMAL NAVBAR */}
      <header className="sticky top-0 z-50 w-full border-b border-[#142f4e]/70 bg-[#030712]/85 backdrop-blur-md text-white shadow-sm">
        <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-xl tracking-tighter text-white">
            <div className="w-8 h-8 bg-gradient-to-br from-[#146984] to-[#32bbc1] rounded-md flex items-center justify-center shadow-[0_0_12px_rgba(50,187,193,0.35)]">
              <span className="text-white text-sm font-bold">NC</span>
            </div>
            <span className="bg-gradient-to-r from-white via-[#d9ffff] to-[#7fdcdd] bg-clip-text text-transparent">News Collector</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-cyan-100/75">
            <a href="#features" className="hover:text-[#d9ffff] transition-colors">Features</a>
            <a href="#collector" className="hover:text-[#d9ffff] transition-colors">Collector</a>
            <button
              onClick={() => {
                setActiveTab('python_code');
                scrollToCollector();
              }}
              className="hover:text-[#d9ffff] transition-colors cursor-pointer"
            >
              Python Engine
            </button>
            <button
              onClick={() => {
                setActiveTab('logs');
                scrollToCollector();
              }}
              className="hover:text-[#d9ffff] transition-colors cursor-pointer"
            >
              Run Logs
            </button>
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setActiveTab('python_code');
                scrollToCollector();
              }}
              className="text-sm font-medium text-cyan-100/75 hover:text-[#d9ffff] transition-colors hidden sm:block cursor-pointer"
            >
              Docs & Tests
            </button>
            <button
              onClick={scrollToCollector}
              className="bg-gradient-to-r from-[#146984] via-[#1ca4af] to-[#32bbc1] text-[#030712] text-sm font-bold px-4 py-2 rounded-full hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(50,187,193,0.3)] active:scale-95"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* 2. MINIMAL HERO */}
        <section className="pt-20 pb-16 md:pt-28 md:pb-24 px-4 text-center max-w-4xl mx-auto">

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight text-balance">
            News to Database <br className="hidden md:block" />{" "}
            <CanvasText
              text="Feed your AI models.."
              backgroundClassName="bg-[#030712] dark:bg-[#030712]"
              colors={[
                "#d9ffff",
                "#caf9f9",
                "#9be7e8",
                "#7fdcdd",
                "#47c6ca",
                "#32bbc1",
                "#23b0b8",
                "#1ca4af",
                "#146984",
                "#184366",
              ]}
              lineGap={4}
              animationDuration={18}
            />
          </h1>

          <p className="text-lg md:text-xl text-[#caf9f9]/80 mb-10 max-w-2xl mx-auto leading-relaxed">
            A beautifully designed, perfectly minimal headline aggregator for researchers and analysts. Curated RSS feeds, polite rate-limiting, and instant multi-format downloads.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={scrollToCollector}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#146984] via-[#1ca4af] to-[#32bbc1] text-[#030712] text-base font-bold px-8 py-3.5 rounded-full hover:brightness-110 transition-all active:scale-95 cursor-pointer shadow-[0_0_25px_rgba(50,187,193,0.35)] hover:shadow-[0_0_35px_rgba(127,220,221,0.5)]"
            >
              Start collecting free
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setActiveTab('python_code');
                scrollToCollector();
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#071225]/70 text-[#d9ffff] text-base font-medium px-8 py-3.5 rounded-full border border-[#1ca4af]/40 hover:bg-[#0d1d36] hover:border-[#32bbc1] transition-all active:scale-95 cursor-pointer backdrop-blur-sm"
            >
              Read the docs & run tests
            </button>
          </div>
        </section>

        {/* 3. FEATURES HEADER SECTION */}
        <section id="features" className="py-20 bg-[#071225]/70 backdrop-blur-sm border-y border-[#142f4e]/60 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-starlight-gradient mb-4">
                Everything you need.
              </h2>
              <p className="text-[#caf9f9]/70 max-w-xl mx-auto">
                We&apos;ve stripped away the complexity so you can focus on what matters most: delivering clean, actionable intelligence from top publications.
              </p>
            </div>

            {/* Feature Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-teal-nebula-card rounded-xl border border-[#146984]/40 hover:border-[#32bbc1]/70 transition-colors shadow-lg">
                <div className="w-10 h-10 rounded-lg bg-[#146984]/30 text-[#7fdcdd] border border-[#1ca4af]/30 flex items-center justify-center font-bold mb-4">
                  01
                </div>
                <h3 className="text-base font-semibold text-white mb-2">Curated Publisher Feeds</h3>
                <p className="text-sm text-[#caf9f9]/70 leading-relaxed">
                  Pre-configured with verified RSS/Atom feeds from BBC, Hacker News, TechCrunch, The Verge, and NPR. Extensible directly via feeds.json.
                </p>
              </div>

              <div className="p-6 bg-teal-nebula-card rounded-xl border border-[#146984]/40 hover:border-[#32bbc1]/70 transition-colors shadow-lg">
                <div className="w-10 h-10 rounded-lg bg-[#146984]/30 text-[#7fdcdd] border border-[#1ca4af]/30 flex items-center justify-center font-bold mb-4">
                  02
                </div>
                <h3 className="text-base font-semibold text-white mb-2">Polite Crawling & SSRF Safe</h3>
                <p className="text-sm text-[#caf9f9]/70 leading-relaxed">
                  Threaded concurrency with host-level throttling delays, retry backoffs, and strict SSRF defenses against private network abuse.
                </p>
              </div>

              <div className="p-6 bg-teal-nebula-card rounded-xl border border-[#146984]/40 hover:border-[#32bbc1]/70 transition-colors shadow-lg">
                <div className="w-10 h-10 rounded-lg bg-[#146984]/30 text-[#7fdcdd] border border-[#1ca4af]/30 flex items-center justify-center font-bold mb-4">
                  03
                </div>
                <h3 className="text-base font-semibold text-white mb-2">In-Memory Multi-Format</h3>
                <p className="text-sm text-[#caf9f9]/70 leading-relaxed">
                  Filter by title or date range and export live datasets directly as UTF-8 CSV, structured JSON, or multi-sheet Excel workbooks.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. INTERACTIVE COLLECTOR WORKSPACE */}
        <section id="collector" className="py-16 px-4 sm:px-6 max-w-6xl mx-auto">
          {/* Workspace Header & Mode Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-8 border-b border-[#142f4e]/70 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#32bbc1] shadow-[0_0_8px_#32bbc1]" />
                <h2 className="text-xl font-bold tracking-tight text-[#d9ffff]">Collector Workspace</h2>
              </div>
              <p className="text-xs text-[#caf9f9]/70 mt-1">
                Select sources, run live collection, and preview or download datasets.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-[#071225]/80 p-1 rounded-lg border border-[#142f4e] text-xs">
              <button
                onClick={() => setActiveTab('app')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  activeTab === 'app'
                    ? 'bg-gradient-to-r from-[#146984] to-[#1ca4af] text-white shadow-xs'
                    : 'text-cyan-100/70 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Collector App
              </button>
              <button
                onClick={() => setActiveTab('python_code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  activeTab === 'python_code'
                    ? 'bg-gradient-to-r from-[#146984] to-[#1ca4af] text-white shadow-xs'
                    : 'text-cyan-100/70 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Python Files & Tests
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  activeTab === 'logs'
                    ? 'bg-gradient-to-r from-[#146984] to-[#1ca4af] text-white shadow-xs'
                    : 'text-cyan-100/70 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Run Log ({runLog.length})
              </button>
            </div>
          </div>

          {activeTab === 'app' && (
          <div className="space-y-8">
            {/* STEP 1: Choose sites */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeInUpVariant}
              className="bg-teal-nebula-card rounded-xl border border-[#146984]/40 p-5 shadow-xl text-white"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#142f4e]/60 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#146984]/30 text-[#7fdcdd] text-xs font-bold flex items-center justify-center border border-[#1ca4af]/40">
                      1
                    </span>
                    <h2 className="text-base font-semibold text-[#d9ffff]">Choose sites</h2>
                  </div>
                  <p className="text-xs text-[#caf9f9]/70 mt-0.5">
                    Select which news sites to include from <code className="text-[#d9ffff] bg-[#071225] border border-[#142f4e] px-1 py-0.5 rounded text-[11px]">feeds.json</code>.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleSelectAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#d9ffff] bg-[#0d1d36] hover:bg-[#142f4e] border border-[#142f4e] hover:border-[#32bbc1] rounded-md transition-colors cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-[#32bbc1]" />
                    Select all
                  </button>
                  <button
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#d9ffff] bg-[#0d1d36] hover:bg-[#142f4e] border border-[#142f4e] hover:border-[#32bbc1] rounded-md transition-colors cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    Clear
                  </button>
                  <button
                    onClick={() => setShowAddSiteModal(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#030712] font-semibold bg-gradient-to-r from-[#23b0b8] to-[#62d1d3] hover:brightness-110 rounded-md transition-colors border border-[#7fdcdd]/40 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-2" />
                    Add site
                  </button>
                </div>
              </div>

              {/* Site Checkboxes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-4">
                {Object.entries(catalog).map(([site, urls], idx) => {
                  const feedCount = urls.length;
                  const isDisabled = feedCount === 0;
                  const isChecked = selectedSites.includes(site);

                  return (
                    <motion.label
                      key={site}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.28) }}
                      whileHover={isDisabled ? {} : { y: -2, transition: { duration: 0.15 } }}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-sm transition-all cursor-pointer ${
                        isDisabled
                          ? 'border-[#142f4e]/30 bg-[#071225]/30 text-slate-500 cursor-not-allowed'
                          : isChecked
                          ? 'border-[#32bbc1] bg-[#142f4e]/50 text-[#d9ffff] shadow-[0_0_12px_rgba(50,187,193,0.18)]'
                          : 'border-[#142f4e] bg-[#0a172d]/60 text-slate-300 hover:border-[#1ca4af] hover:text-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isDisabled}
                        checked={isChecked}
                        onChange={() => handleToggleSite(site)}
                        className="mt-0.5 rounded border-[#142f4e] text-[#146984] accent-[#23b0b8] focus:ring-[#23b0b8]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{site}</div>
                        <div className="text-xs text-[#caf9f9]/60 mt-0.5">
                          {isDisabled ? (
                            <span className="text-slate-500 italic">no feed URLs in feeds.json</span>
                          ) : (
                            <span>
                              {feedCount} feed{feedCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.label>
                  );
                })}
              </div>

              {/* Delay setting & controls */}
              <div className="pt-3 border-t border-[#142f4e]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Sliders className="w-4 h-4 text-[#32bbc1]" />
                  <label htmlFor="delay-slider" className="text-xs font-medium text-[#d9ffff]">
                    Delay between feeds: <span className="font-semibold text-[#7fdcdd]">{delay}s</span>
                  </label>
                  <input
                    id="delay-slider"
                    type="range"
                    min={1}
                    max={10}
                    value={delay}
                    onChange={e => setDelay(Number(e.target.value))}
                    className="w-32 accent-[#23b0b8] cursor-pointer"
                  />
                  <span className="text-[11px] text-[#caf9f9]/50">(polite crawling rate)</span>
                </div>
              </div>
            </motion.section>

            {/* STEP 2: Collect */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeInUpVariant}
              className="bg-teal-nebula-card rounded-xl border border-[#146984]/40 p-5 shadow-xl text-white"
            >
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#146984]/30 text-[#7fdcdd] text-xs font-bold flex items-center justify-center border border-[#1ca4af]/40">
                    2
                  </span>
                  <h2 className="text-base font-semibold text-[#d9ffff]">Collect</h2>
                </div>
              </div>

              {hasSelectionChanged && (
                <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/40 text-amber-200 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Site selection changed. Collect again to update the data.</span>
                </div>
              )}

              <div className="flex flex-col items-center justify-center text-center py-2 gap-2.5">
                <button
                  onClick={handleCollect}
                  disabled={selectedSites.length === 0 || isCollecting}
                  className={`inline-flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md ${
                    selectedSites.length === 0
                      ? 'bg-[#071225]/60 text-slate-500 border border-[#142f4e]/40 cursor-not-allowed'
                      : isCollecting
                      ? 'bg-[#142f4e] text-white cursor-wait border border-[#1ca4af]'
                      : 'bg-gradient-to-r from-[#146984] via-[#1ca4af] to-[#32bbc1] text-[#030712] hover:brightness-110 cursor-pointer active:scale-[0.99] shadow-[0_0_20px_rgba(50,187,193,0.3)]'
                  }`}
                >
                  {isCollecting ? (
                    <div className="flex items-center gap-2.5">
                      <LoaderOne color="#32bbc1" />
                      <span className="text-[#d9ffff]">Collecting headlines...</span>
                    </div>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Collect headlines ({selectedSites.length} site{selectedSites.length > 1 ? 's' : ''} selected)</span>
                    </>
                  )}
                </button>

                {rawItems !== null && (
                  <span className="text-xs text-[#caf9f9]/70">
                    Last collection gathered {rawItems.length} headline{rawItems.length !== 1 ? 's' : ''}.
                  </span>
                )}
              </div>
            </motion.section>

            {/* STEP 3: Preview */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeInUpVariant}
              className="bg-teal-nebula-card rounded-xl border border-[#146984]/40 p-5 shadow-xl text-white"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#142f4e]/60">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#146984]/30 text-[#7fdcdd] text-xs font-bold flex items-center justify-center border border-[#1ca4af]/40">
                    3
                  </span>
                  <h2 className="text-base font-semibold text-[#d9ffff]">Preview</h2>
                </div>

                {rawItems !== null && (
                  <span className="text-xs font-medium text-[#7fdcdd]">
                    Showing {filteredItems.length} of {rawItems.length} headlines
                  </span>
                )}
              </div>

              {rawItems === null ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-[#1ca4af]/60 stroke-1" />
                  <p className="text-sm font-medium text-[#d9ffff]">No headlines collected yet</p>
                  <p className="text-xs text-[#caf9f9]/60 max-w-sm mx-auto">
                    Select your desired sites in Step 1 and click &ldquo;Collect headlines&rdquo; to fetch the latest feeds.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 pt-4">
                  {/* Metrics Row with pop-up animation */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 12 }}
                      whileInView={{ opacity: 1, scale: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: 0.05 }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      className="p-4 bg-[#0a172d]/80 rounded-lg border border-[#142f4e] shadow-2xs"
                    >
                      <div className="text-xs text-[#caf9f9]/70 font-medium">Total Headlines</div>
                      <div className="text-2xl font-bold text-[#d9ffff] mt-1">{rawItems.length}</div>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 12 }}
                      whileInView={{ opacity: 1, scale: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: 0.1 }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      className="p-4 bg-[#0a172d]/80 rounded-lg border border-[#142f4e] shadow-2xs"
                    >
                      <div className="text-xs text-[#caf9f9]/70 font-medium">Sites with Data</div>
                      <div className="text-2xl font-bold text-[#32bbc1] mt-1">{sitesWithDataCount}</div>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 12 }}
                      whileInView={{ opacity: 1, scale: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: 0.15 }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      className="p-4 bg-[#0a172d]/80 rounded-lg border border-[#142f4e] shadow-2xs"
                    >
                      <div className="text-xs text-[#caf9f9]/70 font-medium">Sites with Issues</div>
                      <div className={`text-2xl font-bold mt-1 ${sitesWithIssuesCount > 0 ? 'text-amber-400' : 'text-[#7fdcdd]'}`}>
                        {sitesWithIssuesCount}
                      </div>
                    </motion.div>
                  </div>

                  {/* Site Status Table */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7fdcdd] mb-2">
                      Site Summary
                    </h3>
                    <div className="border border-[#142f4e] rounded-lg overflow-x-auto bg-[#0a172d]/60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#0d1d36] border-b border-[#142f4e] text-[#7fdcdd] font-medium">
                          <tr>
                            <th className="py-2.5 px-3">Site</th>
                            <th className="py-2.5 px-3">Feeds</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#142f4e]/40 text-slate-200">
                          {summaryData.map(row => (
                            <tr key={row.site} className="hover:bg-[#142f4e]/30">
                              <td className="py-2.5 px-3 font-medium text-white">{row.site}</td>
                              <td className="py-2.5 px-3 text-[#caf9f9]/70">{row.feeds}</td>
                              <td className="py-2.5 px-3">{getStatusBadge(row.status)}</td>
                              <td className="py-2.5 px-3 text-slate-400 truncate max-w-md">{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Filters Bar */}
                  <div className="p-4 bg-[#0a172d]/80 border border-[#142f4e] rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#7fdcdd]">
                        Preview Filters
                      </span>
                      {(selectedCategories.length > 0 || searchText || dateFrom || dateTo) && (
                        <button
                          onClick={() => {
                            setSelectedCategories([]);
                            setSearchText('');
                            setDateFrom('');
                            setDateTo('');
                          }}
                          className="text-xs text-[#caf9f9]/80 hover:text-white underline flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Clear filters
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-[#1ca4af] absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search titles..."
                          value={searchText}
                          onChange={e => setSearchText(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-[#030712] border border-[#142f4e] rounded-md text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#32bbc1] focus:ring-1 focus:ring-[#32bbc1]"
                        />
                      </div>

                      {/* Date Range From / To */}
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            aria-label="Filter from date"
                            className="w-full px-2 py-1.5 bg-[#030712] border border-[#142f4e] rounded-md text-xs text-slate-200 focus:outline-none focus:border-[#32bbc1] focus:ring-1 focus:ring-[#32bbc1]"
                          />
                        </div>
                        <span className="text-xs text-[#caf9f9]/50">to</span>
                        <div className="relative flex-1">
                          <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            aria-label="Filter to date"
                            className="w-full px-2 py-1.5 bg-[#030712] border border-[#142f4e] rounded-md text-xs text-slate-200 focus:outline-none focus:border-[#32bbc1] focus:ring-1 focus:ring-[#32bbc1]"
                          />
                        </div>
                      </div>

                      {/* Category Selector */}
                      <div className="relative">
                        <select
                          value=""
                          onChange={e => {
                            const val = e.target.value;
                            if (val && !selectedCategories.includes(val)) {
                              setSelectedCategories([...selectedCategories, val]);
                            }
                          }}
                          aria-label="Filter by category"
                          className="w-full px-2.5 py-1.5 bg-[#030712] border border-[#142f4e] rounded-md text-xs text-slate-200 focus:outline-none focus:border-[#32bbc1] focus:ring-1 focus:ring-[#32bbc1] cursor-pointer"
                        >
                          <option value="" className="bg-[#030712] text-slate-300">Filter by category...</option>
                          {availableCategories.map(cat => (
                            <option key={cat} value={cat} className="bg-[#030712] text-white">
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Active category filters */}
                    {selectedCategories.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-xs text-[#caf9f9]/60">Categories:</span>
                        {selectedCategories.map(cat => (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategories(selectedCategories.filter(c => c !== cat))}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#146984]/40 hover:bg-[#146984]/60 text-[#d9ffff] border border-[#1ca4af]/40 text-xs transition-colors cursor-pointer"
                          >
                            <span>{cat}</span>
                            <X className="w-3 h-3 text-[#7fdcdd]" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Table of Headlines */}
                  {filteredItems.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 bg-[#071225]/50 rounded-lg border border-dashed border-[#142f4e]">
                      <p className="text-sm font-medium text-[#d9ffff]">No headlines match the selected filters.</p>
                      <p className="text-xs text-[#caf9f9]/60 mt-1">Try clearing or broadening your search keywords or date range.</p>
                      <button
                        onClick={() => {
                          setSelectedCategories([]);
                          setSearchText('');
                          setDateFrom('');
                          setDateTo('');
                        }}
                        className="mt-3 px-3 py-1 text-xs font-semibold text-[#030712] bg-[#32bbc1] hover:brightness-110 rounded-md cursor-pointer"
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    <div className="border border-[#142f4e] rounded-lg overflow-x-auto shadow-2xs bg-[#0a172d]/60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#0d1d36] border-b border-[#142f4e] text-[#7fdcdd] font-medium">
                          <tr>
                            <th className="py-2.5 px-3 w-28">Category</th>
                            <th className="py-2.5 px-3 w-32">Source</th>
                            <th className="py-2.5 px-3 min-w-[280px]">Title</th>
                            <th className="py-2.5 px-3 w-40">Published</th>
                            <th className="py-2.5 px-3 w-28">Link</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#142f4e]/40 text-slate-200">
                          {filteredItems.slice(0, 100).map((item, idx) => {
                            const verifiedLink = safeLink(item.link);
                            return (
                              <tr key={idx} className="hover:bg-[#142f4e]/30 transition-colors">
                                <td className="py-2.5 px-3 text-[#7fdcdd] font-medium truncate max-w-[120px]">
                                  {item.category || 'General'}
                                </td>
                                <td className="py-2.5 px-3 text-[#caf9f9]/80 truncate max-w-[130px]">
                                  {item.source}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-white leading-snug">
                                  {item.title}
                                </td>
                                <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                                  {item.published ? (
                                    <span>
                                      {isNaN(new Date(item.published).getTime())
                                        ? item.published
                                        : new Date(item.published).toLocaleString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  {verifiedLink ? (
                                    <a
                                      href={verifiedLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[#32bbc1] hover:text-[#d9ffff] font-medium underline underline-offset-2"
                                    >
                                      <span>Read</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-slate-500">Plain text</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredItems.length > 100 && (
                        <div className="p-2.5 text-center bg-[#071225] text-xs text-[#caf9f9]/70 border-t border-[#142f4e]">
                          Showing first 100 rows in preview. All {filteredItems.length} rows will be exported in downloads.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Category Breakdown */}
                  {categoryCounts.length > 0 && (
                    <div className="pt-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7fdcdd] mb-2">
                        Category Breakdown
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {categoryCounts.slice(0, 8).map((c, idx) => (
                          <motion.div
                            key={c.category}
                            initial={{ opacity: 0, scale: 0.94, y: 10 }}
                            whileInView={{ opacity: 1, scale: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.3, delay: idx * 0.035 }}
                            whileHover={{ y: -2, transition: { duration: 0.15 } }}
                            className="p-2.5 bg-[#0a172d]/80 rounded-lg border border-[#142f4e] flex items-center justify-between shadow-2xs"
                          >
                            <span className="text-xs text-[#caf9f9] font-medium truncate mr-2">
                              {c.category}
                            </span>
                            <span className="text-xs font-bold text-[#030712] bg-[#32bbc1] px-1.5 py-0.5 rounded">
                              {c.count}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.section>

            {/* STEP 4: Download */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeInUpVariant}
              className="bg-teal-nebula-card rounded-xl border border-[#146984]/40 p-5 shadow-xl text-white"
            >
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#146984]/30 text-[#7fdcdd] text-xs font-bold flex items-center justify-center border border-[#1ca4af]/40">
                    4
                  </span>
                  <h2 className="text-base font-semibold text-[#d9ffff]">Download</h2>
                </div>
                <span className="text-xs text-[#caf9f9]/60">
                  Pattern: <code className="text-[#d9ffff] bg-[#071225] border border-[#142f4e] px-1 py-0.5 rounded">headlines_YYYYMMDD-HHMM.&lt;ext&gt;</code>
                </span>
              </div>

              <p className="text-xs text-[#caf9f9]/70 mb-4">
                Downloads use the active filtered dataset ({filteredItems.length} rows) and are built directly in memory.
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownloadCsv}
                  disabled={filteredItems.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#146984] via-[#1ca4af] to-[#32bbc1] text-[#030712] text-xs font-bold rounded-lg shadow-md hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 stroke-2" />
                  Download CSV ({filteredItems.length} rows)
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownloadJson}
                  disabled={filteredItems.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#146984] via-[#1ca4af] to-[#32bbc1] text-[#030712] text-xs font-bold rounded-lg shadow-md hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 stroke-2" />
                  Download JSON ({filteredItems.length} rows)
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownloadExcel}
                  disabled={filteredItems.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#146984] via-[#1ca4af] to-[#32bbc1] text-[#030712] text-xs font-bold rounded-lg shadow-md hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 stroke-2" />
                  Download Excel ({filteredItems.length} rows)
                </motion.button>
              </div>
            </motion.section>
          </div>
        )}

        {/* TAB 2: Python Code & Tests */}
        {activeTab === 'python_code' && (
          <div className="space-y-6">
            <div className="bg-teal-nebula-card rounded-xl border border-[#146984]/40 p-5 shadow-xl text-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#142f4e]/60 gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#d9ffff]">Python Project Files & Local CLI</h2>
                  <p className="text-xs text-[#caf9f9]/70 mt-0.5">
                    Streamlit application (<code className="text-[#32bbc1]">app.py</code>), crawler module, data layer, and pytest test suite.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunPytest}
                    disabled={isRunningTests}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#146984] to-[#23b0b8] hover:brightness-110 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    {isRunningTests ? 'Running pytest...' : 'Run pytest suite'}
                  </button>
                </div>
              </div>

              {/* Instructions on how to run locally */}
              <div className="mt-4 p-3.5 bg-[#030712] border border-[#142f4e] text-slate-200 rounded-lg text-xs font-mono space-y-1">
                <div className="text-[#7fdcdd]"># Run the functional Streamlit app locally:</div>
                <div className="text-white">pip install -r requirements.txt</div>
                <div className="text-[#32bbc1]">streamlit run app.py</div>
              </div>

              {testOutput && (
                <div className="mt-4 p-4 bg-[#030712] border border-[#142f4e] text-emerald-400 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre">
                  {testOutput}
                </div>
              )}

              {/* File switcher */}
              <div className="mt-6">
                <div className="flex items-center gap-1 border-b border-[#142f4e] overflow-x-auto pb-px">
                  {Object.keys(pythonFiles).map(fileName => (
                    <button
                      key={fileName}
                      onClick={() => setActivePythonFile(fileName)}
                      className={`px-3 py-2 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                        activePythonFile === fileName
                          ? 'border-[#32bbc1] text-[#d9ffff] bg-[#0d1d36]/80'
                          : 'border-transparent text-[#caf9f9]/60 hover:text-white'
                      }`}
                    >
                      {fileName}
                    </button>
                  ))}
                </div>

                <div className="relative mt-2">
                  <pre className="p-4 bg-[#030712] border border-[#142f4e] text-[#d9ffff] rounded-lg text-xs font-mono overflow-x-auto max-h-[500px] leading-relaxed">
                    {pythonFiles[activePythonFile] || '# File empty or loading...'}
                  </pre>
                  <button
                    onClick={() => {
                      if (pythonFiles[activePythonFile]) {
                        navigator.clipboard.writeText(pythonFiles[activePythonFile]);
                      }
                    }}
                    className="absolute top-3 right-3 px-2 py-1 bg-[#146984]/50 hover:bg-[#146984] text-[#d9ffff] border border-[#1ca4af]/40 text-[11px] rounded font-sans transition-colors cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Run Log */}
        {activeTab === 'logs' && (
          <div className="bg-teal-nebula-card rounded-xl border border-[#146984]/40 p-5 shadow-xl text-white">
            <h2 className="text-base font-semibold text-[#d9ffff] pb-2">Collector Run Log</h2>
            <p className="text-xs text-[#caf9f9]/70 mb-4">
              Per-feed log lines showing HTTP requests, items parsed, timeouts, or feed warnings.
            </p>

            {runLog.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No collector runs logged yet. Click &ldquo;Collect headlines&rdquo; in Step 2 to generate logs.
              </div>
            ) : (
              <div className="bg-[#030712] border border-[#142f4e] p-4 rounded-lg font-mono text-xs text-slate-200 space-y-1 overflow-x-auto max-h-[500px]">
                {runLog.map((log, i) => {
                  let color = 'text-slate-300';
                  if (log.startsWith('OK:')) color = 'text-[#32bbc1]';
                  else if (log.startsWith('FAIL:')) color = 'text-rose-400';
                  else if (log.startsWith('WARN:')) color = 'text-amber-400';
                  else if (log.startsWith('SKIP:')) color = 'text-slate-500';

                  return (
                    <div key={i} className={color}>
                      {log}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </section>
      </main>

      {/* Floating Scroll to Top Pop-up Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.75, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.75, y: 20 }}
            whileHover={{ scale: 1.1, y: -2 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-40 p-3 bg-gradient-to-r from-[#146984] to-[#23b0b8] text-white rounded-full shadow-[0_0_20px_rgba(50,187,193,0.4)] border border-[#7fdcdd]/50 cursor-pointer flex items-center justify-center hover:brightness-110 transition-all"
            aria-label="Scroll to top"
            title="Scroll to top"
          >
            <ArrowUp className="w-5 h-5 stroke-2" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Add Site Modal */}
      {showAddSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#071225] rounded-xl max-w-md w-full p-5 border border-[#146984] shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-[#142f4e] pb-3">
              <h3 className="text-sm font-bold text-[#d9ffff]">Add New Site to feeds.json</h3>
              <button
                onClick={() => setShowAddSiteModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSite} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#caf9f9]/80 mb-1">
                  Site Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wired, Engadget"
                  value={newSiteName}
                  onChange={e => setNewSiteName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#030712] border border-[#142f4e] rounded-md text-xs text-white focus:outline-none focus:border-[#32bbc1] focus:ring-1 focus:ring-[#32bbc1]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#caf9f9]/80 mb-1">
                  Feed URLs (one per line)
                </label>
                <textarea
                  rows={3}
                  placeholder="https://example.com/rss.xml&#10;https://example.com/feed/"
                  value={newSiteUrls}
                  onChange={e => setNewSiteUrls(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#030712] border border-[#142f4e] rounded-md text-xs font-mono text-white focus:outline-none focus:border-[#32bbc1] focus:ring-1 focus:ring-[#32bbc1]"
                />
                <p className="text-[11px] text-[#caf9f9]/50 mt-1">
                  Leave empty if you wish to add a disabled placeholder site.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#142f4e]">
                <button
                  type="button"
                  onClick={() => setShowAddSiteModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-[#146984] to-[#23b0b8] text-[#030712] rounded-md hover:brightness-110 cursor-pointer shadow-xs"
                >
                  Save to feeds.json
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

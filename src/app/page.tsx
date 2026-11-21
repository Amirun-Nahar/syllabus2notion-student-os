"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import {
  parseSyllabusText,
  ParsedDeliverable,
  DeliverableType,
} from "@/lib/syllabus-parser";
import {
  DiscoveredDatabase,
  DiscoveredCourse,
  PropertyMapping,
} from "@/lib/notion-mapper";
import {
  GraduationCap,
  Sparkles,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Database,
  Trash2,
  RefreshCw,
  ExternalLink,
  Layers,
  FileText,
  Info,
  ShieldCheck,
  Check,
  ChevronRight,
  BookOpen,
} from "lucide-react";

const SAMPLE_MESSY_SYLLABUS = `### CSE 311: Database Management Systems
Instructor: Dr. Tariq Rahman | Room: UB2104 | Fall 2026
Grading Policy & Schedule:
- Lab 1: ER Modeling & Relational Schema - due Week 3 Friday (10 marks)
- Midterm Exam on 2026-10-15 [25%]
- Assignment 1: Complex SQL Queries & Joins due 28/10/2026 (10%)
- Assignment 1: Complex SQL Queries & Joins due 28/10/2026 (10%)
- Term Project Proposal & Schema design (15%)
CSE 311 quiz 2 on 25/11/2026 - 10 marks

## EEE-204 - Electronics II (Course Code: EEE 204)
Course Syllabus & Exam Schedule
• Assignment 1: Op-Amp Frequency Response Due: 12/10/2026 (15%)
• Lab Report 2: Active Filters due Week 7 (10 pts)
• Final Examination on Dec 18, 2026 (40%)`;

const DELIVERABLE_TYPES: DeliverableType[] = [
  "Midterm",
  "Final",
  "Exam",
  "Assignment",
  "Lab",
  "Quiz",
  "Project",
];

export default function Syllabus2NotionPage() {
  // Mode: Judge Sandbox vs Live Notion
  const [isSandbox, setIsSandbox] = useState<boolean>(true);
  const [notionToken, setNotionToken] = useState<string>("");

  // Input states
  const [rawText, setRawText] = useState<string>(SAMPLE_MESSY_SYLLABUS);
  const [semesterStartDate, setSemesterStartDate] = useState<string>("2026-09-01");
  const [defaultCourseCode, setDefaultCourseCode] = useState<string>("CSE 311");

  // Parsed items (editable)
  const [deliverables, setDeliverables] = useState<ParsedDeliverable[]>([]);
  const [, startTransition] = useTransition();

  // Notion discovery state
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoverySuccess, setDiscoverySuccess] = useState<string | null>(null);
  const [tasksDatabase, setTasksDatabase] = useState<DiscoveredDatabase | null>(null);
  const [coursesDatabase, setCoursesDatabase] = useState<DiscoveredDatabase | null>(null);
  const [allDatabases, setAllDatabases] = useState<DiscoveredDatabase[]>([]);
  const [existingCourses, setExistingCourses] = useState<DiscoveredCourse[]>([]);
  const [propertyMapping, setPropertyMapping] = useState<PropertyMapping | null>(null);

  // Sync states
  const [autoCreateCourses, setAutoCreateCourses] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    isSandbox?: boolean;
    createdCount: number;
    skippedCount: number;
    createdPages: Array<{ title: string; courseCode: string; url: string; id: string }>;
    message?: string;
  } | null>(null);

  // Auto-parse rawText when text or semesterStartDate changes
  useEffect(() => {
    const handler = setTimeout(() => {
      startTransition(() => {
        const parsed = parseSyllabusText(rawText, {
          semesterStartDate,
          defaultCourseCode,
        });
        setDeliverables(parsed);
      });
    }, 150);

    return () => clearTimeout(handler);
  }, [rawText, semesterStartDate, defaultCourseCode]);

  // Auto-discover on mount or mode toggle (in sandbox mode)
  useEffect(() => {
    if (isSandbox) {
      handleDiscoverDatabases(true);
    } else {
      // Reset discovery state when entering live mode without token
      setTasksDatabase(null);
      setCoursesDatabase(null);
      setAllDatabases([]);
      setExistingCourses([]);
      setPropertyMapping(null);
      setDiscoverySuccess(null);
      setDiscoveryError(null);
    }
  }, [isSandbox]);

  // Discover databases handler
  const handleDiscoverDatabases = async (forceSandbox = isSandbox) => {
    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoverySuccess(null);

    try {
      const res = await fetch("/api/notion/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: notionToken,
          sandbox: forceSandbox,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to discover Notion databases.");
      }

      setTasksDatabase(data.tasksDatabase);
      setCoursesDatabase(data.coursesDatabase);
      setAllDatabases(data.allDatabases || []);
      setExistingCourses(data.existingCourses || []);
      setPropertyMapping(data.propertyMapping || null);
      setDiscoverySuccess(data.message || "Connected to Student OS!");
    } catch (err: any) {
      setDiscoveryError(err.message || "Connection failed.");
    } finally {
      setIsDiscovering(false);
    }
  };

  // Sync handler
  const handleSyncToNotion = async () => {
    if (!tasksDatabase) {
      setDiscoveryError("Please connect to a Tasks database first.");
      return;
    }

    if (deliverables.length === 0) {
      setDiscoveryError("No deliverables available to sync.");
      return;
    }

    setIsSyncing(true);
    setSyncProgress(
      isSandbox
        ? "Simulating Student OS page generation..."
        : "Creating Notion pages (respecting 350ms rate limit)..."
    );
    setDiscoveryError(null);

    try {
      const res = await fetch("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: notionToken,
          sandbox: isSandbox,
          tasksDatabaseId: tasksDatabase.id,
          coursesDatabaseId: coursesDatabase?.id,
          items: deliverables,
          autoCreateCourses,
          propertyMapping,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Sync failed.");
      }

      setSyncResult(data);
    } catch (err: any) {
      setDiscoveryError(err.message || "Synchronization failed.");
    } finally {
      setIsSyncing(false);
      setSyncProgress("");
    }
  };

  // Deliverable inline editing handlers
  const handleUpdateDeliverable = (
    id: string,
    field: keyof ParsedDeliverable,
    value: any
  ) => {
    setDeliverables((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };
        // Recalculate MISSING_DATE flag if dueDate changed
        if (field === "dueDate") {
          const hasDate = Boolean(value && String(value).trim());
          if (hasDate) {
            updated.flags = updated.flags.filter((f) => f !== "MISSING_DATE");
          } else if (!updated.flags.includes("MISSING_DATE")) {
            updated.flags = [...updated.flags, "MISSING_DATE"];
          }
        }
        return updated;
      })
    );
  };

  const handleDeleteDeliverable = (id: string) => {
    setDeliverables((prev) => prev.filter((item) => item.id !== id));
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = deliverables.length;
    const missingDateCount = deliverables.filter((d) => !d.dueDate || d.flags.includes("MISSING_DATE")).length;
    const readyToSync = deliverables.filter((d) => d.dueDate && d.courseCode).length;
    const totalWeight = deliverables.reduce((sum, d) => sum + (d.weightPercent || 0), 0);

    return { total, missingDateCount, readyToSync, totalWeight };
  }, [deliverables]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* 1. TOP BAR */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                Syllabus2Notion
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Notion Student OS Importer
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Deterministic academic syllabus to Notion database converter
            </p>
          </div>
        </div>

        {/* Mode Switcher & Quick Actions */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setIsSandbox(true)}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                isSandbox
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Judge Sandbox Mode
            </button>
            <button
              onClick={() => setIsSandbox(false)}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                !isSandbox
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Live Notion Student OS
            </button>
          </div>

          {/* Load Sample Syllabus Button */}
          <button
            onClick={() => {
              setRawText(SAMPLE_MESSY_SYLLABUS);
              setSemesterStartDate("2026-09-01");
              setDefaultCourseCode("CSE 311");
            }}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Load Messy Semester Syllabus
          </button>
        </div>
      </header>

      {/* 2. CONNECTION PANEL */}
      <section className="bg-slate-900/50 border-b border-slate-800/80 px-6 py-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Token / Connection controls */}
          <div className="flex flex-wrap items-center gap-3">
            {!isSandbox ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Token:</span>
                <input
                  type="password"
                  placeholder="ntn_... or secret_..."
                  value={notionToken}
                  onChange={(e) => setNotionToken(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Simulated Workspace: Zero-token instant sandbox active</span>
              </div>
            )}

            <button
              onClick={() => handleDiscoverDatabases(isSandbox)}
              disabled={isDiscovering || (!isSandbox && !notionToken.trim())}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? "animate-spin" : ""}`} />
              {isDiscovering ? "Discovering..." : "Auto-Discover Student OS"}
            </button>
          </div>

          {/* Discovered DB Badges and Overrides */}
          <div className="flex flex-wrap items-center gap-2">
            {tasksDatabase ? (
              <div className="flex items-center gap-1.5 bg-slate-800/90 border border-indigo-500/30 px-3 py-1 rounded-lg text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-slate-400">Tasks DB:</span>
                {allDatabases.length > 1 ? (
                  <select
                    value={tasksDatabase.id}
                    onChange={(e) => {
                      const found = allDatabases.find((db) => db.id === e.target.value);
                      if (found) setTasksDatabase(found);
                    }}
                    className="bg-transparent text-indigo-300 font-medium focus:outline-none cursor-pointer"
                  >
                    {allDatabases.map((db) => (
                      <option key={db.id} value={db.id} className="bg-slate-900 text-white">
                        {db.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-indigo-300 font-medium">{tasksDatabase.title}</span>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">No Tasks DB connected</div>
            )}

            {coursesDatabase ? (
              <div className="flex items-center gap-1.5 bg-slate-800/90 border border-emerald-500/30 px-3 py-1 rounded-lg text-xs">
                <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-400">Courses DB:</span>
                <span className="text-emerald-300 font-medium">{coursesDatabase.title}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                  {existingCourses.length} courses
                </span>
              </div>
            ) : null}

            {propertyMapping ? (
              <div className="hidden xl:flex items-center gap-1 bg-slate-950/60 border border-slate-800 px-2.5 py-1 rounded-lg text-[11px] text-slate-400">
                <span className="text-slate-500 font-mono">Map:</span>
                <span className="text-slate-300 font-mono">{propertyMapping.titleProp}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 font-mono">{propertyMapping.dateProp || "No Date"}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 font-mono">{propertyMapping.typeProp || "No Type"}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 font-mono">{propertyMapping.weightProp || "No Weight"}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Feedback messages */}
        {discoveryError && (
          <div className="mt-2.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{discoveryError}</span>
          </div>
        )}
        {discoverySuccess && (
          <div className="mt-2.5 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{discoverySuccess}</span>
          </div>
        )}
      </section>

      {/* 3. KPI STRIP */}
      <section className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3.5 border-b border-slate-800/60">
        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Extracted Items
            </div>
            <div className="text-2xl font-bold text-white mt-0.5">{kpis.total}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Ready to Sync
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-0.5">{kpis.readyToSync}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div
          className={`border p-3.5 rounded-xl flex items-center justify-between transition-colors ${
            kpis.missingDateCount > 0
              ? "bg-amber-950/20 border-amber-500/40"
              : "bg-slate-900/60 border-slate-800"
          }`}
        >
          <div>
            <div className="text-[11px] font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1">
              Missing Date
              {kpis.missingDateCount > 0 && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </div>
            <div className="text-2xl font-bold text-amber-300 mt-0.5">
              {kpis.missingDateCount}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Total Weight (%)
            </div>
            <div className="text-2xl font-bold text-violet-300 mt-0.5">
              {kpis.totalWeight}%
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-violet-500/10 text-violet-400">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* 4. SPLIT-SCREEN MAIN WORKSPACE */}
      <main className="flex-1 px-6 py-4 flex flex-col lg:flex-row gap-5 overflow-hidden">
        {/* LEFT PANE (38%): Raw Input & Settings */}
        <section className="w-full lg:w-[38%] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-400" />
              Messy Syllabus / Notices
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRawText("")}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-800 transition"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Options Row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Semester Start Date:
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={semesterStartDate}
                  onChange={(e) => setSemesterStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Default Course Code:
              </label>
              <input
                type="text"
                placeholder="e.g. CSE 311"
                value={defaultCourseCode}
                onChange={(e) => setDefaultCourseCode(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Textarea */}
          <div className="flex-1 flex flex-col min-h-[300px]">
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste raw university syllabus, assignment tables, WhatsApp exam notices, or grading breakdown here..."
              className="w-full flex-1 p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl font-mono text-xs leading-relaxed text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 resize-y"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 px-1">
              <span>{rawText.split("\n").filter(Boolean).length} lines</span>
              <span>Live debounced deterministic parser active</span>
            </div>
          </div>

          {/* Parsing Cheat-sheet / Info */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-400 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              Supported Deterministic Patterns:
            </div>
            <ul className="text-[11px] space-y-1 list-disc list-inside text-slate-400">
              <li>
                <span className="text-slate-300 font-mono">Week N [Day]</span>: e.g.{" "}
                <code className="text-indigo-300">Week 3 Friday</code>,{" "}
                <code className="text-indigo-300">W7</code>
              </li>
              <li>
                <span className="text-slate-300 font-mono">Dates</span>:{" "}
                <code className="text-indigo-300">2026-10-15</code>,{" "}
                <code className="text-indigo-300">28/10/2026</code>,{" "}
                <code className="text-indigo-300">Dec 18, 2026</code>
              </li>
              <li>
                <span className="text-slate-300 font-mono">Notices</span>: Banglish / WhatsApp formats like{" "}
                <code className="text-indigo-300">CSE 311 quiz 2 on 25/11/2026 - 10 marks</code>
              </li>
              <li>
                <span className="text-slate-300 font-mono">Weights</span>:{" "}
                <code className="text-indigo-300">25%</code>,{" "}
                <code className="text-indigo-300">(15 marks)</code>,{" "}
                <code className="text-indigo-300">10 pts</code>
              </li>
            </ul>
          </div>
        </section>

        {/* RIGHT PANE (62%): Structured Deliverables Table & Sync CTA */}
        <section className="w-full lg:w-[62%] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400" />
                Structured Deliverables Preview ({deliverables.length})
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoCreateCourses}
                  onChange={(e) => setAutoCreateCourses(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                />
                Auto-create missing courses in Notion
              </label>
            </div>
          </div>

          {/* Editable Table */}
          <div className="flex-1 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 flex flex-col">
            <div className="overflow-x-auto flex-1 max-h-[520px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Course</th>
                    <th className="py-2.5 px-3 font-semibold">Deliverable Title</th>
                    <th className="py-2.5 px-3 font-semibold w-28">Type</th>
                    <th className="py-2.5 px-3 font-semibold w-36">Due Date</th>
                    <th className="py-2.5 px-3 font-semibold w-20">Weight %</th>
                    <th className="py-2.5 px-3 font-semibold">Status / Flags</th>
                    <th className="py-2.5 px-2 font-semibold text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {deliverables.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        No deliverables detected. Paste a syllabus on the left or click &quot;Load
                        Messy Semester Syllabus&quot;.
                      </td>
                    </tr>
                  ) : (
                    deliverables.map((item) => {
                      const isMissingDate = !item.dueDate || item.flags.includes("MISSING_DATE");
                      const isDuplicate = item.flags.includes("DUPLICATE_IN_BATCH");

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isMissingDate ? "bg-amber-950/10" : ""
                          }`}
                        >
                          {/* Course Code */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.courseCode}
                              onChange={(e) =>
                                handleUpdateDeliverable(item.id, "courseCode", e.target.value)
                              }
                              className="px-2 py-1 bg-slate-950/80 border border-slate-700 rounded text-xs font-mono font-semibold text-indigo-300 w-24 focus:outline-none focus:border-indigo-500"
                            />
                          </td>

                          {/* Title */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) =>
                                handleUpdateDeliverable(item.id, "title", e.target.value)
                              }
                              className="w-full px-2 py-1 bg-slate-950/80 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                            />
                          </td>

                          {/* Type */}
                          <td className="py-2 px-3">
                            <select
                              value={item.type}
                              onChange={(e) =>
                                handleUpdateDeliverable(
                                  item.id,
                                  "type",
                                  e.target.value as DeliverableType
                                )
                              }
                              className="w-full px-2 py-1 bg-slate-950/80 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            >
                              {DELIVERABLE_TYPES.map((t) => (
                                <option key={t} value={t} className="bg-slate-900 text-white">
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Due Date */}
                          <td className="py-2 px-3">
                            <div className="relative">
                              <input
                                type="date"
                                value={item.dueDate || ""}
                                onChange={(e) =>
                                  handleUpdateDeliverable(
                                    item.id,
                                    "dueDate",
                                    e.target.value || null
                                  )
                                }
                                className={`w-full px-2 py-1 bg-slate-950/80 border rounded text-xs text-slate-200 focus:outline-none ${
                                  isMissingDate
                                    ? "border-amber-500 bg-amber-950/30 text-amber-200"
                                    : "border-slate-700 focus:border-indigo-500"
                                }`}
                              />
                            </div>
                          </td>

                          {/* Weight % */}
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={item.weightPercent ?? ""}
                              placeholder="-"
                              onChange={(e) =>
                                handleUpdateDeliverable(
                                  item.id,
                                  "weightPercent",
                                  e.target.value === "" ? null : parseFloat(e.target.value)
                                )
                              }
                              className="w-16 px-2 py-1 bg-slate-950/80 border border-slate-700 rounded text-xs text-center font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </td>

                          {/* Flags / Status */}
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {isMissingDate && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  MISSING_DATE
                                </span>
                              )}
                              {isDuplicate && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  DUPLICATE
                                </span>
                              )}
                              {!isMissingDate && !isDuplicate && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  READY
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => handleDeleteDeliverable(item.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Sync Bar */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>Target:</span>
                <span className="font-semibold text-slate-200">
                  {tasksDatabase?.title || "Notion Tasks DB"}
                </span>
                {isSandbox && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-medium">
                    Sandbox Mode
                  </span>
                )}
              </div>

              <button
                onClick={handleSyncToNotion}
                disabled={isSyncing || deliverables.length === 0 || !tasksDatabase}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition flex items-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{syncProgress || "Syncing..."}</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Sync {deliverables.length} Items to Notion Student OS</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* 5. SYNC RESULTS MODAL / DRAWER */}
      {syncResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Notion Student OS Sync Complete!
                  </h3>
                  <p className="text-xs text-slate-400">
                    {syncResult.isSandbox
                      ? "Simulated sync completed cleanly in Sandbox Mode"
                      : "Items synchronized to live Notion database"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSyncResult(null)}
                className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-lg hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {/* Modal Body: Stats & Links */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[11px] text-slate-400 uppercase">Created Pages</div>
                  <div className="text-xl font-bold text-emerald-400">
                    {syncResult.createdCount}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[11px] text-slate-400 uppercase">Skipped Duplicates</div>
                  <div className="text-xl font-bold text-slate-300">
                    {syncResult.skippedCount}
                  </div>
                </div>
              </div>

              {/* Clickable Pages List */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                  <span>Generated Notion Student OS Pages:</span>
                  <span className="text-[11px] text-slate-500">
                    {syncResult.createdPages.length} clickable links
                  </span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {syncResult.createdPages.map((page, idx) => (
                    <a
                      key={page.id || idx}
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800/80 rounded-xl text-xs group transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold">
                          {page.courseCode}
                        </span>
                        <span className="text-slate-200 group-hover:text-white font-medium">
                          {page.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-indigo-400 group-hover:text-indigo-300 text-xs">
                        <span>Open in Notion</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end">
              <button
                onClick={() => setSyncResult(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

# Syllabus2Notion (Chaos-to-Student-OS Importer)

Production-ready Next.js web application that converts messy university syllabi, grading tables, and exam notices into structured rows inside the official Notion Campus Leaders "Student OS" template.

---

## 1. What Syllabus2Notion Does & The Problem It Solves

### The Problem:
Every semester, university students face academic organizational chaos. Professors distribute deliverables across disjointed PDFs, unstructured bullet points, markdown syllabus files, course outlines, and unformatted WhatsApp / Telegram notices. 

Common issues students face:
1. **Unformatted Deluge**: Critical deadlines are buried inside paragraphs, multi-course tables, or informal group chat announcements (e.g., `"CSE 311 quiz 2 on 25/11/2026 - 10 marks"`).
2. **Relative Academic Weeks**: Many instructors write `"Midterm on Week 6 Friday"` or `"Lab 3 due W8"` instead of calendar dates, forcing manual calendar calculations.
3. **Varied Date Formats**: Syllabi mix ISO dates (`2026-10-15`), international formats (`28/10/2026`), and written dates (`Dec 18, 2026`).
4. **Manual Notion Entry Bottlenecks**: Copy-pasting 30+ deliverables per semester into the Notion Student OS database takes hours, introduces transcription errors, and causes students to fall behind on assignments.

### The Solution:
**Syllabus2Notion** solves this with an instant, deterministic, zero-runtime-cost importer:
- **Zero-LLM Deterministic Parser**: 100% pure TypeScript engine with zero external AI/LLM API key dependencies. Fast, free, predictable, and runs entirely in-memory.
- **Hierarchical Course Inheritance**: Automatically tracks course code headers (e.g. `CSE 311`, `EEE 204`) and cascades the active course to all subsequent assignments until a new subject is declared.
- **Smart Date Normalizer**: Resolves relative academic weeks (`Week 6 Friday` -> `2026-10-09`) against the semester start date, normalizes international date variations, extracts grade weights (`25%`, `15 marks`, `10 pts`), and flags undated deliverables (`MISSING_DATE`) with an amber warning.
- **Batch Deduplication**: Detects and highlights accidental duplicate deliverables (`DUPLICATE_IN_BATCH`).
- **Dynamic Student OS Auto-Discovery**: Automatically inspects live Notion workspaces to detect `Tasks & Deliverables` and `Courses` databases and maps schemas dynamically without hardcoded IDs.
- **Dual Mode (Sandbox vs. Live)**: Features **Judge Sandbox Mode** for zero-config instant evaluation and **Live Notion Student OS** mode with sequential 350ms rate-limited API synchronization.

---

## 2. How We Used Devin Chat

Devin Chat was utilized as an end-to-end autonomous pair-architect throughout the engineering lifecycle of Syllabus2Notion:
1. **Architectural Scaffolding & Dependency Planning**: Devin orchestrated non-interactive Next.js 16 (App Router), TypeScript, and Tailwind CSS configuration, enforcing minimal runtime footprints (`@notionhq/client`, `lucide-react`) and zero heavy UI framework overhead to remain mobile-hotspot and sandbox safe.
2. **Regex & Grammar Design for Syllabus Parsing**: Devin helped construct deterministic regex patterns and finite-state tokenizers for course code extraction (`CSE 311`, `EEE-204`, `MAT120`), assessment categorization (`Midterm`, `Final`, `Exam`, `Assignment`, `Lab`, `Quiz`, `Project`), and relative academic week math.
3. **CORS Prevention & API Routing**: Devin established strict architectural boundaries ensuring that no browser client component directly communicates with `api.notion.com`. Instead, all Notion API interactions are brokered securely through Next.js App Router routes (`/api/notion/discover` and `/api/notion/sync`).
4. **Node Native Test Suite Formulation**: Devin authored a comprehensive 11-case unit test suite utilizing Node's native `node:test` and `node:assert/strict` harness, verifying course inheritance, Banglish notices, relative week calculations, and dynamic property mapping before UI development.
5. **Robust CJS/ESM Interop & Offline Builds**: Devin diagnosed Node 24 module resolution specifics with `@notionhq/client` and configured standard system fonts to ensure 100% offline-ready builds and zero transient network dependencies.

---

## 3. How Syllabus2Notion Incorporates Notion Student OS

Syllabus2Notion was purposefully engineered around the database architecture and conventions of the official Notion Campus Leaders **"Student OS"** template:

### 1. Dynamic Database Auto-Discovery (`/api/notion/discover`)
Rather than expecting students to copy-paste cryptic 32-character Notion database UUIDs, Syllabus2Notion searches the authenticated workspace using `notion.search({ filter: { property: "object", value: "data_source" } })` with fallback to unfiltered search. It inspects returned titles and schema property types to auto-select:
- **Tasks & Assignments Database**: Identified by title keywords (`Task`, `Assignment`, `Exam`, `Homework`, `Deliverable`, `Student OS`) or schemas possessing both `title` and `date` properties.
- **Courses & Subjects Database**: Identified by title keywords (`Course`, `Class`, `Subject`).
- **Pre-Existing Courses**: Queries the Courses database to index existing enrolled courses (`id` and `title`) for relation mapping.

### 2. Flexible Schema Property Resolution
Notion templates vary across semesters. Syllabus2Notion dynamically resolves property names rather than assuming hardcoded schemas:
| Student OS Property Type | Auto-Discovery Priority Keywords | Action Taken |
| :--- | :--- | :--- |
| **Title** | `Task Name`, `Name`, `Title`, `Assignment` | Populates cleaned title. Prefixes `[COURSE]` if no Course relation is available. |
| **Date** | `Due Date`, `Deadline`, `Due`, `Date` | Populates `{ date: { start: item.dueDate } }`. Safely omitted if undated. |
| **Select / Status** | `Type`, `Category`, `Tag`, `Status`, `Kind` | Matches option case-insensitively or assigns classified deliverable type. |
| **Number** | `Weight %`, `Weight`, `Grade`, `Points`, `Marks` | Populates numerical weight value (e.g. `25` for `25%` or `10` for `10 marks`). |
| **Relation** | `Course`, `Subject`, `Class` | Links deliverable directly to the corresponding Course page ID. |

### 3. Course Relation & Auto-Creation
- If a course relation property exists in the Tasks database, deliverables are automatically linked to their matching Course page.
- If a course does not yet exist in the Courses database, the `Auto-create missing courses in Notion` feature automatically creates a new page in the Courses database before creating the associated assignments.

### 4. Rate-Limit Compliant Sequential Synchronization
Notion limits integrations to an average of 3 requests per second. Syllabus2Notion's server-side sync queue executes sequentially with an enforced 350ms delay between page creations, query deduplication to prevent duplicate entries, and returns clickable Notion URLs for immediate verification.

---

## 4. Instructions for Running & Testing the Project

### Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+`

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Unit Tests (100% Native Node Runner)
Execute the deterministic parser and Notion mapper test suite:
```bash
npm test
```
*Expected result: 11 tests passing with 0 failures.*

### 3. Production Build
Verify Next.js compilation and route generation:
```bash
npm run build
```

### 4. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Testing Judge Sandbox Mode (Zero-Config)
1. By default, the application opens in **Judge Sandbox Mode** (green shield badge in the top bar).
2. Click **"Load Messy Semester Syllabus"** in the top bar.
3. Observe:
   - **Left Pane (38%)**: Pre-populates with realistic, messy syllabus text spanning `CSE 311` and `EEE 204`, including relative weeks, WhatsApp notices, grade weights, and an undated item.
   - **Right Pane (62%)**: Instantly renders the live-parsed deliverables table with inline-editable fields.
   - **KPI Strip**: Updates in real time (`Extracted Items: 8`, `Ready to Sync: 7`, `Missing Date: 1` in amber, `Total Weight (%): 125%`).
   - **Validation Highlights**: The undated `Term Project Proposal & Schema design` highlights with an amber `MISSING_DATE` badge and border. The repeated `Assignment 1` displays a `DUPLICATE` flag.
4. Click **"Sync 8 Items to Notion Student OS"**.
5. Observe the completion modal displaying:
   - `Created Pages: 7`
   - `Skipped Duplicates: 1`
   - Clickable Notion page links list with course badges.

### 6. Testing Live Notion Student OS Mode
1. Click the **"Live Notion Student OS"** tab in the top bar.
2. Enter your Notion integration token (`ntn_...` or `secret_...`).
3. Click **"Auto-Discover Student OS"**. The app will discover your databases, inspect property types, and index existing courses.
4. Paste your custom syllabus or exam notices, edit any values directly in the table, and click **"Sync Items to Notion Student OS"**.

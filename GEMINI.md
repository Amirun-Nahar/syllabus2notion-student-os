# Project Rules: Syllabus2Notion (Notion Student OS Importer)

## Architecture & Constraints
- **Framework**: Next.js (App Router), TypeScript, Tailwind CSS, Lucide React, `@notionhq/client`.
- **Zero Interactive CLI Prompts**: Always pass `--yes` or non-interactive flags when running `npx` or `npm` commands.
- **Lightweight Dependencies (Mobile Hotspot Safe)**: Use Node's native `node --test` (with `--experimental-strip-types` or `tsx`) instead of heavy test frameworks like Jest. Do NOT install heavy UI libraries.
- **Zero Browser CORS Errors**: Never call `api.notion.com` from client components. All Notion API calls MUST go through Next.js App Router API routes (`/api/notion/discover` and `/api/notion/sync`).
- **Zero Runtime LLM Keys**: All syllabus parsing, date normalization, and Notion property mapping must be 100% deterministic TypeScript.
- **Auto-Discovery First**: Never hardcode Notion Database IDs or exact property names. Inspect live Notion database schemas returned by `notion.search()` and map fields dynamically by property type (`title`, `date`, `select`, `status`, `number`, `relation`).
- **Dual Mode**: Support both **Live Notion Student OS** (using an `ntn_...` / `secret_...` token) and **Judge Sandbox Mode** (zero-config simulated workspace).
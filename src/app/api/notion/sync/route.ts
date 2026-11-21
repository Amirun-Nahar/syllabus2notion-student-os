import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import { buildNotionPagePayload } from "@/lib/notion-mapper";
import type { ParsedDeliverable } from "@/lib/syllabus-parser";

const require = createRequire(import.meta.url);
const { Client } = require("@notionhq/client");

interface SyncRequestBody {
  token?: string;
  sandbox?: boolean;
  tasksDatabaseId: string;
  coursesDatabaseId?: string;
  items: ParsedDeliverable[];
  autoCreateCourses?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body: SyncRequestBody = await req.json().catch(() => ({}));
    const {
      token,
      sandbox,
      tasksDatabaseId,
      coursesDatabaseId,
      items,
      autoCreateCourses = true,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "No deliverables provided for synchronization." },
        { status: 400 }
      );
    }

    // 1. JUDGE SANDBOX MODE
    if (sandbox) {
      const createdPages: Array<{ title: string; courseCode: string; url: string; id: string }> = [];
      let skippedCount = 0;
      const seenTitles = new Set<string>();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const normalizedTitle = item.title.trim().toLowerCase();

        // Simulate deduplication
        if (seenTitles.has(normalizedTitle) || item.flags.includes("DUPLICATE_IN_BATCH")) {
          skippedCount++;
          continue;
        }
        seenTitles.add(normalizedTitle);

        // Simulate page creation latency (e.g. 50ms)
        await new Promise((res) => setTimeout(res, 50));

        const mockId = `sandbox-page-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
        createdPages.push({
          title: item.title,
          courseCode: item.courseCode,
          url: `https://notion.so/student-os/${mockId}`,
          id: mockId,
        });
      }

      return NextResponse.json({
        success: true,
        isSandbox: true,
        createdCount: createdPages.length,
        skippedCount,
        createdPages,
        message: `[Sandbox] Successfully simulated syncing ${createdPages.length} deliverables to Notion Student OS (${skippedCount} duplicates skipped).`,
      });
    }

    // 2. LIVE NOTION MODE
    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { error: "Notion API token is required for live synchronization." },
        { status: 400 }
      );
    }
    if (!tasksDatabaseId) {
      return NextResponse.json(
        { error: "Tasks database ID is required." },
        { status: 400 }
      );
    }

    const notion = new Client({ auth: token.trim() });

    // Fetch tasks database schema
    const tasksDb = (await notion.databases.retrieve({
      database_id: tasksDatabaseId,
    })) as any;

    const dbSchema = tasksDb.properties || {};

    // Check existing tasks to skip duplicates
    const existingTitles = new Set<string>();
    try {
      const existingQuery = await notion.databases.query({
        database_id: tasksDatabaseId,
        page_size: 100,
      });

      for (const page of existingQuery.results as any[]) {
        if (page.properties) {
          const titleProp = Object.values(page.properties).find(
            (p: any) => p.type === "title"
          ) as any;
          const pageTitle =
            titleProp?.title?.map((t: any) => t.plain_text).join("").trim() || "";
          if (pageTitle) {
            existingTitles.add(pageTitle.toLowerCase());
          }
        }
      }
    } catch (e) {
      console.warn("Could not query existing tasks database pages:", e);
    }

    // Map courses
    const courseMap = new Map<string, string>(); // courseCode (upper) -> pageId
    if (coursesDatabaseId) {
      try {
        const coursesDb = (await notion.databases.retrieve({
          database_id: coursesDatabaseId,
        })) as any;

        const coursesQuery = await notion.databases.query({
          database_id: coursesDatabaseId,
          page_size: 100,
        });

        const courseTitlePropName =
          Object.entries(coursesDb.properties).find(
            ([_, p]: any) => p.type === "title"
          )?.[0] || "Name";

        for (const page of coursesQuery.results as any[]) {
          const titleProp = page.properties[courseTitlePropName];
          const courseTitle =
            titleProp?.title?.map((t: any) => t.plain_text).join("").trim() || "";

          // Match course code in title (e.g. "CSE 311: Database..." -> "CSE 311")
          const m = courseTitle.match(/([A-Za-z]{2,5}[\s\-_]?[0-9]{3,4}[A-Za-z]?)/i);
          if (m) {
            const cleanCode = m[1].toUpperCase().replace(/[-_]/g, " ");
            courseMap.set(cleanCode, page.id);
            courseMap.set(cleanCode.replace(/\s+/g, ""), page.id);
          }
          courseMap.set(courseTitle.toUpperCase(), page.id);
        }

        // Auto-create missing courses if enabled
        if (autoCreateCourses) {
          const neededCourses = new Set(
            items.map((i) => i.courseCode.trim().toUpperCase())
          );

          for (const courseCode of neededCourses) {
            if (courseCode && !courseMap.has(courseCode) && !courseMap.has(courseCode.replace(/\s+/g, ""))) {
              try {
                const newCoursePage = await notion.pages.create({
                  parent: { database_id: coursesDatabaseId },
                  properties: {
                    [courseTitlePropName]: {
                      title: [{ text: { content: courseCode } }],
                    },
                  },
                });
                courseMap.set(courseCode, newCoursePage.id);
                // 350ms delay
                await new Promise((r) => setTimeout(r, 350));
              } catch (createCourseErr) {
                console.warn(`Failed to auto-create course ${courseCode}:`, createCourseErr);
              }
            }
          }
        }
      } catch (e) {
        console.warn("Could not query or auto-create courses:", e);
      }
    }

    const createdPages: Array<{ title: string; courseCode: string; url: string; id: string }> = [];
    let skippedCount = 0;

    // Create pages sequentially with 350ms delay
    for (const item of items) {
      const titleLower = item.title.trim().toLowerCase();
      const prefixedTitleLower = `[${item.courseCode}] ${item.title}`.trim().toLowerCase();

      if (existingTitles.has(titleLower) || existingTitles.has(prefixedTitleLower)) {
        skippedCount++;
        continue;
      }

      const cleanCode = item.courseCode.toUpperCase().replace(/[-_]/g, " ");
      const matchedCourseId =
        courseMap.get(cleanCode) ||
        courseMap.get(cleanCode.replace(/\s+/g, "")) ||
        courseMap.get(item.courseCode.toUpperCase());

      const payloadProps = buildNotionPagePayload(item, dbSchema, matchedCourseId);

      const createdPage = (await notion.pages.create({
        parent: { database_id: tasksDatabaseId },
        properties: payloadProps,
      })) as any;

      const pageUrl =
        createdPage.url ||
        `https://notion.so/${createdPage.id.replace(/-/g, "")}`;

      createdPages.push({
        title: item.title,
        courseCode: item.courseCode,
        url: pageUrl,
        id: createdPage.id,
      });

      existingTitles.add(titleLower);

      // Notion rate limit delay: 350ms
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    return NextResponse.json({
      success: true,
      isSandbox: false,
      createdCount: createdPages.length,
      skippedCount,
      createdPages,
      message: `Successfully synchronized ${createdPages.length} deliverables to Notion Student OS (${skippedCount} duplicates skipped).`,
    });
  } catch (err: any) {
    console.error("Error in /api/notion/sync:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Failed to sync deliverables to Notion. Check database schema permissions.",
      },
      { status: 500 }
    );
  }
}


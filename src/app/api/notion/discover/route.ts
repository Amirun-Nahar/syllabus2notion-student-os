import { NextRequest, NextResponse } from "next/server";
import {
  discoverStudentOSDatabases,
  getSandboxStudentOS,
} from "@/lib/notion-mapper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, sandbox } = body;

    // 1. Judge Sandbox Mode
    if (sandbox) {
      const sandboxData = getSandboxStudentOS();
      return NextResponse.json({
        success: true,
        isSandbox: true,
        ...sandboxData,
        message: "Successfully loaded simulated Notion Student OS workspace.",
      });
    }

    // 2. Live Mode
    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        {
          error:
            "Missing Notion API token. Please provide an Internal Integration Secret starting with 'ntn_' or 'secret_'.",
        },
        { status: 400 }
      );
    }

    const trimmedToken = token.trim();
    const result = await discoverStudentOSDatabases(trimmedToken);

    if (result.allDatabases.length === 0) {
      return NextResponse.json(
        {
          error:
            "No databases discovered. Ensure your Notion Integration is connected and granted read/write access to your Student OS pages.",
          allDatabases: [],
          existingCourses: [],
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      isSandbox: false,
      ...result,
      message: `Discovered ${result.allDatabases.length} databases and ${result.existingCourses.length} existing courses in Student OS.`,
    });
  } catch (err: any) {
    console.error("Error in /api/notion/discover:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Failed to connect to Notion. Check your API token and workspace permissions.",
      },
      { status: 500 }
    );
  }
}


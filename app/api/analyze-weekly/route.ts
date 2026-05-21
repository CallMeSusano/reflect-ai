import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildBackendUrl() {
  const baseUrl = process.env.ANALYZER_API_URL ?? "http://127.0.0.1:8000";
  return `${baseUrl.replace(/\/$/, "")}/analyze-weekly`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { entries, language } = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { detail: "entries must be a non-empty array" },
        { status: 400 }
      );
    }

    // Validate each entry has title and content
    for (const entry of entries) {
      if (!entry.title || typeof entry.title !== "string") {
        return NextResponse.json(
          { detail: "Each entry must have a title" },
          { status: 400 }
        );
      }
      if (!entry.content || typeof entry.content !== "string") {
        return NextResponse.json(
          { detail: "Each entry must have content" },
          { status: 400 }
        );
      }
    }

    // Send entries to backend analyzer
    const upstreamResponse = await fetch(buildBackendUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entries, language: language ?? "en" }),
      cache: "no-store",
    });

    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await upstreamResponse.json()
      : { detail: await upstreamResponse.text() };

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          detail:
            typeof payload?.detail === "string"
              ? payload.detail
              : "Weekly narrative generation failed",
          upstream: payload,
        },
        { status: upstreamResponse.status }
      );
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        detail: "Could not reach analyzer backend",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildBackendUrl() {
  const baseUrl = process.env.ANALYZER_API_URL ?? "http://127.0.0.1:8000";
  return `${baseUrl.replace(/\/$/, "")}/analyze-text`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { detail: "Missing or invalid text field" },
        { status: 400 }
      );
    }

    if (text.trim().length === 0) {
      return NextResponse.json(
        { detail: "Text content cannot be empty" },
        { status: 400 }
      );
    }

    // Send text to backend analyzer
    const upstreamResponse = await fetch(buildBackendUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
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
              : "Analyzer backend request failed",
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



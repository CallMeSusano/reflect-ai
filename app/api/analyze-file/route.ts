import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildBackendUrl() {
  const baseUrl = process.env.ANALYZER_API_URL ?? "http://127.0.0.1:8000";
  return `${baseUrl.replace(/\/$/, "")}/analyze-file`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ detail: "Missing file field" }, { status: 400 });
    }

    const upstreamFormData = new FormData();
    upstreamFormData.set("file", file, file.name);

    const upstreamResponse = await fetch(buildBackendUrl(), {
      method: "POST",
      body: upstreamFormData,
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


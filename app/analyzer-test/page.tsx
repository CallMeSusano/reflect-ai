"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Emotion = {
  label: string;
  score: number;
};

type AnalyzeResult = {
  summary: string;
  emotions: Emotion[];
  metadata: Record<string, unknown>;
};

export default function AnalyzerTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!file) {
      setError("Please select a .txt file first.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Only .txt files are supported for this test.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    setIsLoading(true);
    try {
      const response = await fetch("/api/analyze-file", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          typeof payload?.detail === "string"
            ? payload.detail
            : "Analysis request failed."
        );
        return;
      }

      setResult(payload as AnalyzeResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unexpected network error."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Analyzer Test (No Firebase)</h1>
        <Link href="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Journal Text</CardTitle>
          <CardDescription>
            This page bypasses Firebase and calls the Python analyzer through a Next.js API proxy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="file"
              accept=".txt,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Analyzing..." : "Analyze File"}
            </Button>
          </form>
          {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h2 className="mb-1 font-semibold">Summary</h2>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>

            <div>
              <h2 className="mb-1 font-semibold">Emotions</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.emotions.map((emotion) => (
                  <li key={emotion.label}>
                    {emotion.label}: {emotion.score.toFixed(3)}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="mb-1 font-semibold">Metadata</h2>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(result.metadata, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}


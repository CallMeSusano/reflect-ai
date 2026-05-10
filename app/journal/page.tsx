"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/firebase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  createdAt: string;
}

type SortOption = "newest" | "oldest" | "mood" | "title";

type BulkAnalysis = {
  totalEntries: number;
  overallSummary: string;
  emotionTrends: Array<{ label: string; score: number }>;
  topMoods: Array<{ mood: string; count: number }>;
};

const MOOD_PALETTES: Record<string, { bg: string; text: string; badge: string }> = {
  happy:    { bg: "#FFFBEB", text: "#F59E0B", badge: "bg-amber-100 text-amber-800" },
  sad:      { bg: "#EFF6FF", text: "#3B82F6", badge: "bg-blue-100 text-blue-800" },
  anxious:  { bg: "#FFF1F2", text: "#F43F5E", badge: "bg-rose-100 text-rose-800" },
  grateful: { bg: "#F0FDF4", text: "#22C55E", badge: "bg-green-100 text-green-800" },
  angry:    { bg: "#FFF7ED", text: "#EA580C", badge: "bg-orange-100 text-orange-800" },
  peaceful: { bg: "#F0FDFA", text: "#0D9488", badge: "bg-teal-100 text-teal-800" },
  proud:    { bg: "#FAF5FF", text: "#9333EA", badge: "bg-purple-100 text-purple-800" },
  relieved: { bg: "#F0FDF4", text: "#16A34A", badge: "bg-emerald-100 text-emerald-800" },
  default:  { bg: "#FAFAF9", text: "#78716C", badge: "bg-stone-100 text-stone-700" },
};

const MOOD_EMOJI: Record<string, string> = {
  happy: "😊", sad: "😢", anxious: "😰", grateful: "🙏",
  angry: "😤", peaceful: "😌", proud: "💪", relieved: "😮‍💨", default: "✦",
};

function getMoodPalette(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_PALETTES).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_PALETTES.default
  );
}

function getMoodEmoji(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_EMOJI).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_EMOJI.default
  );
}

function computeStats(entries: JournalEntry[]) {
  const total = entries.length;

  const moodCount: Record<string, number> = {};
  for (const e of entries) {
    if (e.mood) {
      const key = e.mood.toLowerCase();
      moodCount[key] = (moodCount[key] ?? 0) + 1;
    }
  }
  const topMood = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];

  const now = new Date();
  const thisMonth = entries.filter((e) => {
    const d = new Date(e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const daySet = new Set(
    entries.map((e) => {
      const d = new Date(e.createdAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (daySet.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return { total, topMood, thisMonth, streak };
}

function sortEntries(entries: JournalEntry[], sort: SortOption): JournalEntry[] {
  return [...entries].sort((a, b) => {
    switch (sort) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "mood":
        return (a.mood ?? "").localeCompare(b.mood ?? "");
      case "title":
        return (a.title ?? "").localeCompare(b.title ?? "");
    }
  });
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOption>("newest");
  const [bulkAnalysisLoading, setBulkAnalysisLoading] = useState(false);
  const [bulkAnalysisError, setBulkAnalysisError] = useState("");
  const [bulkAnalysisResult, setBulkAnalysisResult] = useState<BulkAnalysis | null>(null);
  const [showBulkAnalysis, setShowBulkAnalysis] = useState(false);

  // FIX 1 — mountedRef: prevents any async callback that outlives the
  // component from calling setState, which would keep the closure (and
  // the full querySnapshot it captured) alive and unpooled by the GC.
  const mountedRef = useRef(true);

  // FIX 2 — fetchGenRef: onAuthStateChanged re-fires on every token
  // refresh, tab focus, and network reconnect. Without a generation
  // counter, every re-fire spawns a new getDocs call that runs in
  // parallel with the previous one. Each call closes over its own
  // querySnapshot; they all race to call setState. By bumping the
  // counter synchronously on each auth event, stale in-flight fetches
  // can detect they've been superseded and drop their data immediately.
  const fetchGenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Bump generation synchronously — before any await — so the
      // previous in-flight IIFE sees the mismatch on its next check.
      const currentGen = ++fetchGenRef.current;

      if (!user) {
        if (mountedRef.current) {
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      // FIX 3 — async IIFE instead of async callback: making the
      // onAuthStateChanged callback itself async would cause Firebase to
      // receive a Promise it doesn't await, silently swallowing errors
      // and making the listener harder to unsubscribe cleanly. An IIFE
      // keeps the outer callback synchronous while still letting us use
      // await inside, and closes over currentGen for stale-check access.
      (async () => {
        try {
          const q = query(
            collection(db, "users", user.uid, "journals"),
            orderBy("createdAt", "desc")
          );
          const querySnapshot = await getDocs(q);

          // Bail out if unmounted OR if auth fired again while we awaited.
          // Returning here lets querySnapshot go out of scope immediately
          // so the GC can reclaim all document data without waiting for
          // the rest of this function to finish.
          if (!mountedRef.current || fetchGenRef.current !== currentGen) return;

          const data: JournalEntry[] = [];
          querySnapshot.forEach((doc) => {
            const docData = doc.data();
            data.push({
              id: doc.id,
              title: docData.title,
              mood: docData.mood,
              content: docData.content,
              createdAt:
                typeof docData.createdAt === "number"
                  ? new Date(docData.createdAt).toISOString()
                  : docData.createdAt?.toDate?.()?.toISOString() ??
                    new Date().toISOString(),
            });
          });

          setEntries(data);
        } catch (error) {
          if (mountedRef.current && fetchGenRef.current === currentGen) {
            console.error("Error fetching journals:", error);
          }
        } finally {
          // FIX 4 — setLoading in finally: the original code put
          // setLoading(false) at the end of the auth callback, which
          // meant a second auth firing during an in-flight fetch would
          // set loading=false before the fetch resolved, causing a
          // jarring flash. finally guarantees exactly one transition,
          // and only from the fetch that won the generation race.
          if (mountedRef.current && fetchGenRef.current === currentGen) {
            setLoading(false);
          }
        }
      })();
    });

    return () => {
      // Tell every in-flight IIFE to discard its result.
      mountedRef.current = false;
      // Detach the auth listener so Firebase stops calling the callback.
      unsubscribe();
    };
  }, []);

  const stats = useMemo(() => computeStats(entries), [entries]);
  const sorted = useMemo(() => sortEntries(entries, sort), [entries, sort]);

  const handleBulkAnalyze = async () => {
    if (entries.length === 0) {
      setBulkAnalysisError("No entries to analyze");
      return;
    }

    setBulkAnalysisLoading(true);
    setBulkAnalysisError("");

    try {
      const combinedText = entries
        .map((entry) => `Title: ${entry.title}\n\n${entry.content}`)
        .join("\n\n---\n\n");

      const response = await fetch("/api/analyze-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: combinedText }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setBulkAnalysisError(
          typeof payload?.detail === "string"
            ? payload.detail
            : "Analysis request failed."
        );
        return;
      }

      const moodCounts: Record<string, number> = {};
      entries.forEach((entry) => {
        if (entry.mood) {
          moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
        }
      });

      const topMoods = Object.entries(moodCounts)
        .map(([mood, count]) => ({ mood, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const result: BulkAnalysis = {
        totalEntries: entries.length,
        overallSummary: payload.summary,
        emotionTrends: payload.emotions || [],
        topMoods,
      };

      setBulkAnalysisResult(result);
      setShowBulkAnalysis(true);
    } catch (err) {
      setBulkAnalysisError(
        err instanceof Error ? err.message : "Unexpected network error."
      );
    } finally {
      setBulkAnalysisLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 md:px-8 md:py-12">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
          <p className="text-sm text-muted-foreground font-sans">Loading your entries…</p>
        </div>
      ) : (
        <>
          {entries.length > 0 && (
            <div className="grid grid-cols-2 gap-4 mb-8">
              <Card className="row-span-2 bg-card border flex flex-col justify-between p-6 md:p-8 rounded-2xl overflow-hidden relative">
                <div
                  aria-hidden
                  className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/5 pointer-events-none"
                />
                <CardContent className="p-0 flex flex-col justify-between h-full gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans mb-3">
                      Total entries
                    </p>
                    <p className="text-7xl font-serif font-medium leading-none text-foreground">
                      {stats.total}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">
                      Current streak
                    </p>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-serif font-medium leading-none">
                        {stats.streak}
                      </span>
                      <span className="text-sm text-muted-foreground font-sans pb-0.5">
                        {stats.streak === 1 ? "day" : "days"}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {Array.from({ length: Math.min(stats.streak, 7) }).map((_, i) => (
                        <div key={i} className="h-1.5 flex-1 rounded-full bg-primary/60" />
                      ))}
                      {Array.from({ length: Math.max(0, 7 - stats.streak) }).map((_, i) => (
                        <div key={i} className="h-1.5 flex-1 rounded-full bg-muted" />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border rounded-2xl overflow-hidden">
                <CardContent className="p-5 md:p-6 flex flex-col justify-between h-full gap-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">
                    Top mood
                  </p>
                  {stats.topMood ? (
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none">{getMoodEmoji(stats.topMood[0])}</span>
                      <div>
                        <p className="text-lg font-serif capitalize leading-tight">{stats.topMood[0]}</p>
                        <p className="text-xs text-muted-foreground font-sans">
                          {stats.topMood[1]} {stats.topMood[1] === 1 ? "entry" : "entries"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground font-sans">—</p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border rounded-2xl overflow-hidden">
                <CardContent className="p-5 md:p-6 flex flex-col justify-between h-full gap-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-sans">
                    This month
                  </p>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-serif font-medium leading-none">{stats.thisMonth}</span>
                    <span className="text-sm text-muted-foreground font-sans pb-0.5">
                      {stats.thisMonth === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {entries.length > 0 && (
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-muted-foreground font-sans">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBulkAnalyze}
                  disabled={bulkAnalysisLoading}
                  className="text-sm px-4 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80 bg-primary/10 text-primary font-sans disabled:opacity-50"
                >
                  {bulkAnalysisLoading ? "Analyzing all…" : "Analyze All Entries"}
                </button>
                <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                  <SelectTrigger className="w-40 h-8 text-xs font-sans rounded-lg border bg-background">
                    <SelectValue placeholder="Sort by…" />
                  </SelectTrigger>
                  <SelectContent align="end" className="text-xs font-sans">
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="mood">By mood</SelectItem>
                    <SelectItem value="title">By title A–Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {bulkAnalysisError && (
            <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive text-sm font-sans">
              <p>Bulk analysis failed: {bulkAnalysisError}</p>
            </div>
          )}

          {showBulkAnalysis && bulkAnalysisResult && (
            <div className="mb-8 p-6 border border-border/40 rounded-lg bg-card">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-serif">Overall Analysis</h3>
                <button
                  onClick={() => setShowBulkAnalysis(false)}
                  className="text-xs opacity-50 hover:opacity-80 font-sans"
                >
                  Hide
                </button>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-medium font-sans text-muted-foreground mb-2">
                  Summary ({bulkAnalysisResult.totalEntries} entries)
                </h4>
                <p className="text-base leading-relaxed font-serif text-foreground/80">
                  {bulkAnalysisResult.overallSummary}
                </p>
              </div>

              {bulkAnalysisResult.emotionTrends && bulkAnalysisResult.emotionTrends.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium font-sans text-muted-foreground mb-3">
                    Emotion Trends
                  </h4>
                  <div className="grid gap-2">
                    {bulkAnalysisResult.emotionTrends.map((emotion) => (
                      <div key={emotion.label} className="flex items-center justify-between">
                        <span className="text-sm font-sans font-medium capitalize">{emotion.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${Math.min(emotion.score * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground font-sans w-10 text-right">
                            {(emotion.score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkAnalysisResult.topMoods && bulkAnalysisResult.topMoods.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium font-sans text-muted-foreground mb-3">
                    Top Moods
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {bulkAnalysisResult.topMoods.map((item) => (
                      <span
                        key={item.mood}
                        className="px-3 py-1 rounded-full text-xs font-medium font-sans bg-primary/10 text-primary"
                      >
                        {item.mood} ({item.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {entries.length === 0 ? (
            <div className="text-center py-32 border border-dashed rounded-2xl bg-muted/30">
              <p className="text-2xl mb-4 text-muted-foreground font-serif">No entries yet</p>
              <Link href="/journal/new">
                <button className="px-5 py-2.5 text-sm border rounded-lg hover:bg-muted transition-colors font-sans">
                  Start writing seamlessly
                </button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {sorted.map((entry) => {
                const p = getMoodPalette(entry.mood);
                return (
                  <Link key={entry.id} href={`/journal/${entry.id}`} className="group block">
                    <Card className="bg-card text-card-foreground border rounded-xl transition-all duration-300 hover:border-primary/50 hover:shadow-sm hover:-translate-y-0.5">
                      <CardContent className="p-6 md:p-8">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs text-muted-foreground uppercase tracking-widest font-sans">
                            {new Date(entry.createdAt).toLocaleDateString("en-US", {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                          {entry.mood && (
                            <Badge
                              variant="outline"
                              className={`text-xs px-3 py-0.5 rounded-full font-medium border-0 ${p.badge} font-sans`}
                            >
                              {getMoodEmoji(entry.mood)}&nbsp;{entry.mood}
                            </Badge>
                          )}
                        </div>
                        <h2 className="text-2xl font-serif mb-3 leading-tight group-hover:text-primary/70 transition-colors">
                          {entry.title}
                        </h2>
                        <p className="text-muted-foreground text-base font-serif leading-relaxed line-clamp-3">
                          {entry.content}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

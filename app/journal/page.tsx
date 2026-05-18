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
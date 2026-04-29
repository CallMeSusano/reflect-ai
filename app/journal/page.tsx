"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/firebase";

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  createdAt: string;
}

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

function getMoodPalette(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_PALETTES).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_PALETTES.default
  );
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(
            collection(db, "users", user.uid, "journals"),
            orderBy("createdAt", "desc")
          );
          const querySnapshot = await getDocs(q);
          const data: JournalEntry[] = [];
          
          querySnapshot.forEach((doc) => {
            const docData = doc.data();
            data.push({
              id: doc.id,
              title: docData.title,
              mood: docData.mood,
              content: docData.content,
              createdAt: typeof docData.createdAt === "number" 
                ? new Date(docData.createdAt).toISOString()
                : (docData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()),
            });
          });
          
          setEntries(data);
        } catch (error) {
          console.error("Error fetching journals:", error);
        }
      } else {
        setEntries([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 md:px-8 md:py-12">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
          <p className="text-sm text-muted-foreground font-sans">Loading your entries…</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-32 border border-dashed rounded-2xl bg-muted/30">
          <p className="text-2xl mb-4 text-muted-foreground font-serif">No entries yet</p>
          <Link href="/journal/new">
            <button className="px-5 py-2.5 text-sm border rounded-lg hover:bg-muted transition-colors font-sans">
              Start writing seamlessly
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          {entries.map((entry) => {
            const p = getMoodPalette(entry.mood);
            return (
              <Link key={entry.id} href={`/journal/${entry.id}`} className="group block">
                <div className="bg-card text-card-foreground border rounded-xl p-6 md:p-8 transition-all duration-300 hover:border-primary/50 hover:shadow-sm hover:-translate-y-0.5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-sans">
                      {new Date(entry.createdAt).toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' })}
                    </span>
                    {entry.mood && (
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${p.badge} font-sans`}>
                        {entry.mood}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-serif mb-3 leading-tight group-hover:text-primary/70 transition-colors">{entry.title}</h2>
                  <p className="text-muted-foreground text-base font-serif leading-relaxed line-clamp-3">
                    {entry.content}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

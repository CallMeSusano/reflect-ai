"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/navbar";

const DEMO_ENTRIES = [
  {
    text: "Today I finally said what I've been holding back for months. It didn't go perfectly, but I said it — and that's enough.",
    mood: "Relieved",
    moodColor: "bg-emerald-100 text-emerald-800",
    date: "Yesterday"
  },
  {
    text: "Three years ago I was terrified of public speaking. Today I gave a talk to 200 people. I still can't believe that was me up there.",
    mood: "Proud",
    moodColor: "bg-amber-100 text-amber-800",
    date: "2 days ago"
  },
  {
    text: "Sometimes growth looks like staying in bed an extra hour and choosing kindness over productivity. Rest is not failure.",
    mood: "Peaceful",
    moodColor: "bg-sky-100 text-sky-800",
    date: "Last week"
  }
];

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setDisplayed("");
    setIdx(0);
  }, [text]);

  useEffect(() => {
    if (idx < text.length) {
      const t = setTimeout(() => {
        setDisplayed(text.slice(0, idx + 1));
        setIdx(i => i + 1);
      }, 28);
      return () => clearTimeout(t);
    }
  }, [idx, text]);

  return (
    <span>
      {displayed}
      {idx < text.length && (
        <span className="inline-block w-0.5 h-5 bg-foreground/70 ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const [activeEntry, setActiveEntry] = useState(0);
  const [firstLine, setFirstLine] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const FEATURES = [
    {
      icon: "✦",
      title: t("landing.features.aiPrompts"),
      description: t("landing.features.aiPromptsDesc"),
    },
    {
      icon: "◈",
      title: t("landing.features.moodTracking"),
      description: t("landing.features.moodTrackingDesc"),
    },
    {
      icon: "⬡",
      title: t("landing.features.private"),
      description: t("landing.features.privateDesc"),
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveEntry(i => (i + 1) % DEMO_ENTRIES.length);
    }, 5500);
    return () => clearInterval(interval);
  }, []);

  const entry = DEMO_ENTRIES[activeEntry];

  return (
    <div className="flex flex-col min-h-svh bg-background text-foreground font-serif">

      <Navbar mode="landing" />

      <main className="flex-1">

        {/* Hero */}
        <section className="px-6 md:px-10 pt-20 pb-16 max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-10">
            <div className="flex -space-x-2">
              {["#C084FC","#60A5FA","#34D399","#F472B6"].map((c,i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-background" style={{ background: c }} />
              ))}
            </div>
            <span className="text-sm text-muted-foreground font-sans">
              {t("landing.entriesThisWeek", { count: "12,400" })}
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-8 max-w-3xl">
            {t("landing.headlineStart")}{" "}
            <em className="italic text-foreground/50">{t("landing.headlineEm")}</em>{" "}
            {t("landing.headlineEnd")}
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mb-12 font-sans">
            {t("landing.subheadline")}
          </p>

          {/* First-line CTA */}
          <div className="max-w-2xl">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-widest font-sans">
              {t("landing.startFirstEntry")}
            </p>
            <div
              className={`flex items-center gap-3 px-5 py-4 rounded-xl border transition-all duration-200 ${
                focused
                  ? "border-primary/30 bg-muted/40"
                  : "border-border/40 bg-muted/20 hover:border-border/80"
              }`}
            >
              <span className="text-muted-foreground/30 text-lg shrink-0">"</span>
              <input
                ref={inputRef}
                type="text"
                value={firstLine}
                onChange={e => setFirstLine(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={t("landing.inputPlaceholder")}
                className="flex-1 bg-transparent outline-none text-foreground/90 placeholder-muted-foreground text-lg font-serif"
              />
              <Link href={`/login?first=${encodeURIComponent(firstLine)}`}>
                <button className="shrink-0 px-4 py-2 bg-foreground text-background text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors font-sans">
                  {t("landing.continueBtn")}
                </button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground/60 mt-2 ml-1 font-sans">
              {t("landing.freeForever")}
            </p>
          </div>
        </section>

        {/* Live Entry Preview */}
        <section className="px-6 md:px-10 py-16 border-t border-border/40">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 font-sans">
                {t("landing.realEntriesLabel")}
              </p>
              <h2 className="text-3xl md:text-4xl font-normal leading-tight mb-6">
                {t("landing.realEntriesHeadline")}
              </h2>
              <div className="flex gap-2 mt-8">
                {DEMO_ENTRIES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveEntry(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === activeEntry ? "bg-foreground w-6" : "bg-muted-foreground/40"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Entry card */}
            <div className="relative">
              <div className="bg-card text-card-foreground rounded-2xl p-8 shadow-2xl border border-border/50">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-sans">{entry.date}</span>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${entry.moodColor} font-sans`}>
                    {entry.mood}
                  </span>
                </div>
                <p className="text-card-foreground/90 text-lg leading-relaxed min-h-[100px] font-serif">
                  <TypewriterText key={activeEntry} text={entry.text} />
                </p>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-300 to-pink-300" />
                  <span className="text-xs text-muted-foreground font-sans">Anonymous · Reflect member</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 md:px-10 py-16 border-t border-border/40">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {FEATURES.map((f, i) => (
                <div key={i} className="group">
                  <div className="text-2xl mb-5 text-muted-foreground group-hover:text-foreground/80 transition-colors">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-medium mb-3 text-foreground/90 font-sans">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed font-sans">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 md:px-10 py-20 border-t border-border/40 text-center">
          <div className="max-w-2xl mx-auto">
            <p className="text-sm text-muted-foreground mb-4 font-sans">
              {t("landing.joinWriters", { count: "14,000+" })}
            </p>
            <h2 className="text-4xl md:text-5xl font-normal mb-8 leading-tight whitespace-pre-line">
              {t("landing.cta")}
            </h2>
            <Link href="/login">
              <button className="px-8 py-4 bg-foreground text-background text-base font-semibold rounded-xl hover:bg-foreground/90 transition-colors font-sans">
                {t("landing.createAccount")}
              </button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 md:px-10 py-8 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground font-sans">
          {t("landing.footerCopyright", { year: new Date().getFullYear() })}
        </span>
        <div className="flex gap-6 text-sm text-muted-foreground font-sans">
          <a href="#" className="hover:text-foreground/80 transition-colors">{t("landing.privacy")}</a>
          <a href="#" className="hover:text-foreground/80 transition-colors">{t("landing.terms")}</a>
        </div>
      </footer>
    </div>
  );
}

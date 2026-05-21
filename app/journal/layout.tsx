"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { useTranslation } from "react-i18next";

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isStatsActive = pathname.startsWith("/journal/stats");
  const isJournalActive =
    pathname === "/journal" || (pathname.startsWith("/journal/") && !isStatsActive);
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-svh">
      <Navbar mode="journal" />
      <div className="sticky top-14 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto flex h-12 items-center gap-2 px-4 md:px-8">
            <Link
            href="/journal"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              isJournalActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("journal.myJournal")}
          </Link>
          <Link
            href="/journal/stats"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              isStatsActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("journal.insights", "Insights")}
          </Link>
        </div>
      </div>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  );
}

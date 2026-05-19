import { Navbar } from "@/components/navbar";

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-svh">
      <Navbar mode="journal" />
      <main className="flex-1 bg-background">{children}</main>
    </div>
  );
}

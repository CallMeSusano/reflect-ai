import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex flex-col min-h-svh">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
            R
          </div>
          <span className="font-bold text-xl tracking-tight">Reflect AI</span>
        </div>
        <nav>
          <Link href="/login">
            <Button variant="ghost" className="mr-2">Log in</Button>
          </Link>
          <Link href="/login">
            <Button>Get Started</Button>
          </Link>
        </nav>
      </header>
      
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 mb-16">
        <div className="max-w-3xl space-y-8">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-balance">
            Your mindful space for <span className="text-primary block">daily reflection.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Reflect AI provides a secure, peaceful environment to capture your thoughts, emotions, and experiences every single day.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link href="/login">
              <Button size="lg" className="h-14 px-8 text-lg w-full sm:w-auto">
                Start writing today
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="h-14 px-8 text-lg w-full sm:w-auto">
                Learn more
              </Button>
            </Link>
          </div>
        </div>
      </main>
      
      <footer className="py-6 text-center text-sm text-muted-foreground border-t">
        <p>© {new Date().getFullYear()} Reflect AI. All rights reserved.</p>
      </footer>
    </div>
  )
}

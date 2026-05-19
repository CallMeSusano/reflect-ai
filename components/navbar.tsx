"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth } from "@/firebase";
import { setAuthCookie } from "@/app/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

interface NavbarProps {
  mode: "landing" | "journal";
}

export function Navbar({ mode }: NavbarProps) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (mode !== "journal") return;
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return unsubscribe;
  }, [mode]);

  const handleLogout = async () => {
    await signOut(auth);
    await setAuthCookie("");
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between mx-auto px-4 md:px-8">
        {mode === "landing" ? (
          <Link
            href="/"
            className="text-xl font-serif font-light tracking-widest text-foreground hover:opacity-70 transition-opacity"
          >
            Reflect
          </Link>
        ) : (
          <Link
            href="/journal"
            className="flex items-center gap-2 font-sans font-bold tracking-tight"
          >
            <div className="h-6 w-6 rounded bg-foreground flex items-center justify-center text-background font-bold text-xs">
              R
            </div>
            Reflect
          </Link>
        )}

        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />

          {mode === "landing" && (
            <>
              <Link href="/login">
                <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-sans">
                  {t("nav.signIn")}
                </button>
              </Link>
              <Link href="/login">
                <button className="px-4 py-2 text-sm bg-foreground text-background rounded-md font-medium hover:bg-foreground/90 transition-colors font-sans">
                  {t("nav.startFree")}
                </button>
              </Link>
            </>
          )}

          {mode === "journal" && (
            <>
              <Link href="/assistant" className="ml-2">
                <Button variant="ghost" size="sm">
                  {t("nav.assistant")}
                </Button>
              </Link>
              <Link href="/journal/new">
                <Button variant="default" size="sm">
                  {t("nav.newEntry")}
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full ml-1">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={user?.photoURL || ""}
                        alt={user?.displayName || "User"}
                      />
                      <AvatarFallback>
                        {user?.email?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.displayName || t("nav.reflectMember")}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-red-500 cursor-pointer focus:text-red-500"
                  >
                    {t("common.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

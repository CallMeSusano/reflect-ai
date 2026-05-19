"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth, googleProvider } from "@/firebase";
import { setAuthCookie } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAuthSuccess = async (user: any) => {
    try {
      const token = await user.getIdToken();
      await setAuthCookie(token);
      router.push("/journal");
    } catch (err) {
      console.error("[auth] handleAuthSuccess failed:", err);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await handleAuthSuccess(userCredential.user);
    } catch (err: any) {
      setError(err.message || "Failed to log in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignup = async () => {
    setIsLoading(true);
    setError("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await handleAuthSuccess(userCredential.user);
    } catch (err: any) {
      setError(err.message || "Failed to sign up");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      await handleAuthSuccess(userCredential.user);
    } catch (err: any) {
      setError(err.message || "Failed to log in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4 bg-background text-foreground font-serif relative">
      <div className="absolute top-4 right-6 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-card/40 p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-8 text-center">
          <Link href="/">
            <div className="h-10 w-10 mx-auto mb-6 rounded-md bg-foreground flex items-center justify-center">
              <span className="text-background font-bold text-lg font-sans">R</span>
            </div>
          </Link>
          <h1 className="text-3xl font-light mb-2">{t("login.welcomeBack")}</h1>
          <p className="text-sm text-muted-foreground font-sans">{t("login.subtitle")}</p>
        </div>

        <div className="grid gap-6">
          <form onSubmit={handleEmailLogin} className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="email" className="text-xs text-muted-foreground uppercase tracking-widest font-sans">
                {t("auth.email")}
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-background/50 border rounded-lg px-4 py-2.5 text-foreground placeholder-muted-foreground/50 outline-none focus:border-primary/50 transition-colors font-sans text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="text-xs text-muted-foreground uppercase tracking-widest font-sans">
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-background/50 border rounded-lg px-4 py-2.5 text-foreground placeholder-muted-foreground/50 outline-none focus:border-primary/50 transition-colors font-sans text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-500 font-sans">{error}</p>}

            <div className="flex flex-col gap-3 mt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-foreground text-background font-medium rounded-lg hover:bg-foreground/90 transition-colors disabled:opacity-50 font-sans text-sm"
              >
                {isLoading ? t("login.signingIn") : t("nav.signIn")}
              </button>
              <button
                type="button"
                onClick={handleEmailSignup}
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-transparent border text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50 font-sans text-sm"
              >
                {t("login.createAccount")}
              </button>
            </div>
          </form>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest font-sans">
              <span className="bg-card px-3 text-muted-foreground">{t("login.or")}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-background/50 border text-foreground font-medium rounded-lg hover:bg-muted transition-colors disabled:opacity-50 font-sans text-sm"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t("login.continueWithGoogle")}
          </button>
        </div>
      </div>
    </div>
  );
}

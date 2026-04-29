"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, googleProvider } from "@/firebase";
import { setAuthCookie } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAuthSuccess = async (user: any) => {
    const token = await user.getIdToken();
    await setAuthCookie(token);
    router.push("/journal");
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>Enter your email below to login to your account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form onSubmit={handleEmailLogin} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Loading..." : "Login"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={handleEmailSignup} disabled={isLoading}>
              Sign up
            </Button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          <Button variant="outline" type="button" disabled={isLoading} onClick={handleGoogleLogin}>
            Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

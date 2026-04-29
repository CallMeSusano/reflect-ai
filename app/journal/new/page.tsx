"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewJournalEntryPage() {
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setError("You must be logged in to create an entry");
      return;
    }
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await addDoc(collection(db, "users", auth.currentUser.uid, "journals"), {
        title,
        mood,
        content,
        userId: auth.currentUser.uid,
        createdAt: Date.now(),
      });
      router.push("/journal");
    } catch (err: any) {
      setError(err.message || "Failed to create entry");
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <div className="mb-8">
        <Link href="/journal" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
          &larr; Back to Journal
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">How are you feeling today?</h1>
        <p className="text-muted-foreground mt-2">
          Take a deep breath and write whatever comes to mind. This space is just for you.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {error && <p className="text-sm text-destructive">{error}</p>}
        
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input 
            id="title" 
            placeholder="A brief title for your day..." 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mood">Mood</Label>
          <Input 
            id="mood" 
            placeholder="e.g. Peaceful, Anxious, Joyful..." 
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Journal Entry</Label>
          <Textarea 
            id="content" 
            placeholder="What's going on in your mind?" 
            className="min-h-[250px] resize-y" 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="flex justify-end space-x-4 pt-4 border-t">
          <Link href="/journal">
            <Button variant="outline" type="button" disabled={loading}>Cancel</Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Entry"}
          </Button>
        </div>
      </form>
    </div>
  );
}

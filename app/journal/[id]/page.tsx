"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  userId: string;
  createdAt: string;
}

export default function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const entryId = resolvedParams.id;

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editMood, setEditMood] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid, "journals", entryId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            const loadedEntry = {
              id: docSnap.id,
              title: data.title,
              mood: data.mood,
              content: data.content,
              userId: data.userId,
              createdAt: typeof data.createdAt === "number"
                ? new Date(data.createdAt).toISOString()
                : (data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString())
            };
            setEntry(loadedEntry);
            setEditTitle(loadedEntry.title);
            setEditMood(loadedEntry.mood);
            setEditContent(loadedEntry.content);
          }
        } catch (err) {
          console.error("Error fetching document:", err);
          setError("Failed to load journal entry");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [entryId]);

  const handleUpdate = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      setError("Title and content cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "users", auth.currentUser!.uid, "journals", entryId);
      await updateDoc(docRef, {
        title: editTitle,
        mood: editMood,
        content: editContent,
        updatedAt: Date.now()
      });
      setEntry((prev) => prev ? { ...prev, title: editTitle, mood: editMood, content: editContent } : null);
      setIsEditing(false);
      setError("");
    } catch (err) {
      console.error("Error updating document:", err);
      setError("Failed to update journal entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    
    try {
      const docRef = doc(db, "users", auth.currentUser!.uid, "journals", entryId);
      await deleteDoc(docRef);
      router.push("/journal");
    } catch (err) {
      console.error("Error deleting document:", err);
      setError("Failed to delete journal entry.");
    }
  };

  if (loading) {
    return <div className="container mx-auto py-10 max-w-2xl text-center">Loading entry...</div>;
  }

  if (!entry || (auth.currentUser && entry.userId !== auth.currentUser.uid)) {
    return (
      <div className="container mx-auto py-10 max-w-2xl text-center">
        <h1 className="text-2xl font-bold mb-4">Entry not found or unauthorized</h1>
        <Link href="/journal">
          <Button variant="outline">Back to Journal</Button>
        </Link>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="container mx-auto py-10 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Edit Entry</h1>
        </div>
        <div className="space-y-6">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input 
              id="title" 
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mood">Mood</Label>
            <Input 
              id="mood" 
              value={editMood}
              onChange={(e) => setEditMood(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">Journal Entry</Label>
            <Textarea 
              id="content" 
              className="min-h-[250px] resize-y" 
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="flex justify-end space-x-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <div className="mb-8 relative">
        <Link href="/journal" className="text-sm text-muted-foreground hover:underline mb-6 inline-block">
          &larr; Back to Journal
        </Link>
        {error && <p className="text-sm text-destructive mb-4">{error}</p>}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{entry.title}</h1>
            <p className="text-muted-foreground mt-2">
              {new Date(entry.createdAt).toLocaleDateString()} {entry.mood ? `• Mood: ` : ''}
              <span className="text-foreground font-medium">{entry.mood}</span>
            </p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>
             <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </div>

      <div className="prose prose-stone dark:prose-invert max-w-none">
        <p className="text-lg leading-relaxed whitespace-pre-wrap">
          {entry.content}
        </p>
      </div>
    </div>
  );
}

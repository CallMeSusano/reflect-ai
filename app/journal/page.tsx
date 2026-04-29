"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/firebase";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface JournalEntry {
  id: string;
  title: string;
  mood: string;
  content: string;
  createdAt: string;
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
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Journal</h1>
          <p className="text-muted-foreground mt-2">
            Reflect on your thoughts, emotions, and daily experiences.
          </p>
        </div>
        <Link href="/journal/new">
          <Button>Write New Entry</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableCaption>{loading ? "Loading entries..." : entries.length === 0 ? "You have no journal entries yet." : "A list of your recent thoughts."}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="w-[200px]">Title</TableHead>
              <TableHead className="w-[120px]">Mood</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>{entry.title}</TableCell>
                <TableCell>{entry.mood}</TableCell>
                <TableCell className="truncate max-w-[200px] text-muted-foreground block border-none pt-[14px]">
                  {entry.content}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/journal/${entry.id}`}>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

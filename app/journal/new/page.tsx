"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, addDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { Image as ImageIcon, Video as VideoIcon, X, Upload, FileImage, FileVideo } from "lucide-react";

interface StagedFile {
  id: string;
  file: File;
  type: "photos" | "videos";
  previewUrl: string;
  uploadProgress: number; // 0–100, -1 = error
}

interface SavedMediaFile {
  type: "photos" | "videos";
  filename: string;
}

const MOOD_PALETTES: Record<string, { accentText: string; accentBorder: string; pill: string }> = {
  happy:    { accentText: "text-amber-500",   accentBorder: "border-amber-400/40",   pill: "bg-amber-50 dark:bg-amber-950/30" },
  sad:      { accentText: "text-blue-500",    accentBorder: "border-blue-400/40",    pill: "bg-blue-50 dark:bg-blue-950/30" },
  anxious:  { accentText: "text-rose-500",    accentBorder: "border-rose-400/40",    pill: "bg-rose-50 dark:bg-rose-950/30" },
  grateful: { accentText: "text-green-500",   accentBorder: "border-green-400/40",   pill: "bg-green-50 dark:bg-green-950/30" },
  angry:    { accentText: "text-orange-500",  accentBorder: "border-orange-400/40",  pill: "bg-orange-50 dark:bg-orange-950/30" },
  peaceful: { accentText: "text-teal-500",    accentBorder: "border-teal-400/40",    pill: "bg-teal-50 dark:bg-teal-950/30" },
  proud:    { accentText: "text-purple-500",  accentBorder: "border-purple-400/40",  pill: "bg-purple-50 dark:bg-purple-950/30" },
  relieved: { accentText: "text-emerald-500", accentBorder: "border-emerald-400/40", pill: "bg-emerald-50 dark:bg-emerald-950/30" },
  default:  { accentText: "text-muted-foreground", accentBorder: "border-border",    pill: "bg-muted/30" },
};

function getMoodPalette(mood: string) {
  const lower = mood?.toLowerCase() ?? "";
  return (
    Object.entries(MOOD_PALETTES).find(([key]) => lower.includes(key))?.[1] ??
    MOOD_PALETTES.default
  );
}

function WordCount({ text }: { text: string }) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = Math.ceil(words / 200);
  return (
    <span className="text-xs text-muted-foreground font-sans tabular-nums">
      {words} words · {minutes} min read
    </span>
  );
}

function MediaGrid({
  files,
  onRemove,
  uploading,
}: {
  files: StagedFile[];
  onRemove: (id: string) => void;
  uploading: boolean;
}) {
  if (files.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border/40">
      <p className="text-xs text-muted-foreground font-sans mb-3 uppercase tracking-wider">
        Attachments · {files.length}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {files.map((f) => (
          <div key={f.id} className="relative group rounded-xl overflow-hidden aspect-square bg-muted/30 border border-border/50">
            {f.type === "photos" ? (
              <img
                src={f.previewUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={f.previewUrl}
                className="w-full h-full object-cover bg-black"
                muted
              />
            )}

            {/* Type badge */}
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/50 text-white rounded-md px-1.5 py-0.5 backdrop-blur-sm">
              {f.type === "photos"
                ? <FileImage className="w-3 h-3" />
                : <FileVideo className="w-3 h-3" />
              }
              <span className="text-[10px] font-sans font-medium">
                {f.type === "photos" ? "Photo" : "Video"}
              </span>
            </div>

            {/* Upload progress overlay */}
            {uploading && f.uploadProgress < 100 && f.uploadProgress >= 0 && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                <div className="w-3/4 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-300"
                    style={{ width: `${f.uploadProgress}%` }}
                  />
                </div>
                <span className="text-white text-[10px] font-sans">{f.uploadProgress}%</span>
              </div>
            )}

            {/* Error overlay */}
            {f.uploadProgress === -1 && (
              <div className="absolute inset-0 bg-destructive/60 flex items-center justify-center">
                <span className="text-white text-[10px] font-sans font-medium">Failed</span>
              </div>
            )}

            {/* Remove button – hidden while uploading */}
            {!uploading && (
              <button
                type="button"
                onClick={() => onRemove(f.id)}
                className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive backdrop-blur-sm"
                aria-label="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewJournalContent() {
  const searchParams = useSearchParams();
  const initialContent = searchParams.get("first") || "";

  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("");
  const [content, setContent] = useState(initialContent);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [content]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      stagedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  const stageFiles = (fileList: FileList, fileType: "photos" | "videos") => {
    const newFiles: StagedFile[] = Array.from(fileList).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      type: fileType,
      previewUrl: URL.createObjectURL(file),
      uploadProgress: 0,
    }));
    setStagedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: "photos" | "videos") => {
    if (e.target.files && e.target.files.length > 0) {
      stageFiles(e.target.files, fileType);
    }
    // Reset so same file can be re-added if needed
    e.target.value = "";
  };

  const removeStaged = (id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const uploadSingleFile = async (staged: StagedFile): Promise<SavedMediaFile | null> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
    const formData = new FormData();
    formData.append("file", staged.file);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setStagedFiles((prev) =>
            prev.map((f) => (f.id === staged.id ? { ...f, uploadProgress: pct } : f))
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({ type: staged.type, filename: data.filename });
          } catch {
            setStagedFiles((prev) =>
              prev.map((f) => (f.id === staged.id ? { ...f, uploadProgress: -1 } : f))
            );
            resolve(null);
          }
        } else {
          setStagedFiles((prev) =>
            prev.map((f) => (f.id === staged.id ? { ...f, uploadProgress: -1 } : f))
          );
          resolve(null);
        }
      };

      xhr.onerror = () => {
        setStagedFiles((prev) =>
          prev.map((f) => (f.id === staged.id ? { ...f, uploadProgress: -1 } : f))
        );
        resolve(null);
      };

      xhr.open("POST", `${apiUrl}/upload/${staged.type}`);
      xhr.send(formData);
    });
  };

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

    setSubmitting(true);
    setUploadingMedia(stagedFiles.length > 0);
    setError("");

    try {
      // Upload all staged files concurrently with progress tracking
      const uploadResults = await Promise.all(stagedFiles.map(uploadSingleFile));
      const savedMedia: SavedMediaFile[] = uploadResults.filter(Boolean) as SavedMediaFile[];

      const failedCount = uploadResults.filter((r) => r === null).length;
      if (failedCount > 0) {
        setError(`${failedCount} file(s) failed to upload. Entry saved with successful uploads only.`);
      }

      setUploadingMedia(false);

      await addDoc(collection(db, "users", auth.currentUser!.uid, "journals"), {
        title,
        mood,
        content,
        media: savedMedia,
        userId: auth.currentUser!.uid,
        createdAt: Date.now(),
      });

      // CLEANUP: Revoke all object URLs to free memory
      stagedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      setStagedFiles([]);

      router.push("/journal");
    } catch (err: any) {
      setError(err.message || "Failed to create entry");
      setSubmitting(false);
      setUploadingMedia(false);
    }
  };

  const palette = getMoodPalette(mood);
  const hasMedia = stagedFiles.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 transition-colors duration-500 bg-background text-foreground font-serif"
    >
      {/* Top bar */}
      <div className="sticky top-14 z-10 backdrop-blur-sm border-b border-border/40 px-6 py-3 flex items-center justify-between bg-background/95">
        <Link
          href="/journal"
          className="text-sm flex items-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity font-sans"
        >
          ← Cancel
        </Link>

        <WordCount text={content} />

        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium transition-opacity hover:opacity-90 disabled:opacity-50 font-sans flex items-center gap-2"
        >
          {submitting ? (
            <>
              {uploadingMedia ? (
                <>
                  <Upload className="w-3.5 h-3.5 animate-bounce" />
                  Uploading…
                </>
              ) : (
                "Saving…"
              )}
            </>
          ) : (
            <>
              {hasMedia && <Upload className="w-3.5 h-3.5 opacity-70" />}
              Finish
            </>
          )}
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col min-h-[85vh]">
        {error && (
          <p className="text-sm text-destructive mb-6 font-sans bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {/* Mood pill */}
        <div className="mb-8">
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="How are you feeling?"
            className={`text-sm px-3 py-1.5 rounded-full border bg-transparent outline-none focus:ring-2 transition-all w-2/3 md:w-auto font-sans focus:ring-primary/20 ${palette.accentText} ${palette.accentBorder} ${palette.pill}`}
          />
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give this entry a title…"
          className="w-full bg-transparent outline-none text-4xl mb-8 font-light tracking-tight placeholder-muted-foreground/30 font-serif"
        />

        {/* Body */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind today?"
          className="w-full bg-transparent outline-none resize-none text-lg leading-[1.9] overflow-hidden flex-grow placeholder-muted-foreground/30 font-serif"
          style={{ minHeight: "200px" }}
        />

        {/* Media grid */}
        <MediaGrid files={stagedFiles} onRemove={removeStaged} uploading={uploadingMedia} />

        {/* Media toolbar */}
        <div className="flex items-center gap-1 mt-8 pt-4 border-t border-border/40">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            ref={photoInputRef}
            onChange={(e) => handleFileChange(e, "photos")}
          />
          <input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            ref={videoInputRef}
            onChange={(e) => handleFileChange(e, "videos")}
          />

          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={submitting}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-sans px-3 py-2 rounded-lg hover:bg-muted/60 disabled:opacity-40"
          >
            <ImageIcon className="w-4 h-4" />
            <span>Photos</span>
          </button>

          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={submitting}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-sans px-3 py-2 rounded-lg hover:bg-muted/60 disabled:opacity-40"
          >
            <VideoIcon className="w-4 h-4" />
            <span>Videos</span>
          </button>

          {hasMedia && !submitting && (
            <span className="ml-auto text-xs text-muted-foreground font-sans">
              {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} ready to upload
            </span>
          )}

          {uploadingMedia && (
            <span className="ml-auto text-xs text-muted-foreground font-sans flex items-center gap-1.5">
              <Upload className="w-3 h-3 animate-bounce" />
              Uploading {stagedFiles.filter((f) => f.uploadProgress === 100).length}/{stagedFiles.length}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}

export default function NewJournalEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
        </div>
      }
    >
      <NewJournalContent />
    </Suspense>
  );
}
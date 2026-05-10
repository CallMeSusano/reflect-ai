"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { Image as ImageIcon, Video as VideoIcon, X, Upload, FileImage, FileVideo } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────── */

interface SavedMediaFile {
    type: "photos" | "videos";
    filename: string;
}

interface StagedFile {
    id: string;
    file: File;
    type: "photos" | "videos";
    previewUrl: string;
    uploadProgress: number; // 0–100, -1 = error
}

type MediaItem =
    | { kind: "saved"; data: SavedMediaFile }
    | { kind: "staged"; data: StagedFile };

interface JournalEntry {
    id: string;
    title: string;
    mood: string;
    content: string;
    media: SavedMediaFile[];
    userId: string;
    createdAt: number;
}

/* ─── Mood palettes ──────────────────────────────────────────── */

const MOOD_PALETTES: Record<string, { accentText: string; accentBorder: string; pill: string }> = {
    happy: { accentText: "text-amber-500", accentBorder: "border-amber-400/40", pill: "bg-amber-50 dark:bg-amber-950/30" },
    sad: { accentText: "text-blue-500", accentBorder: "border-blue-400/40", pill: "bg-blue-50 dark:bg-blue-950/30" },
    anxious: { accentText: "text-rose-500", accentBorder: "border-rose-400/40", pill: "bg-rose-50 dark:bg-rose-950/30" },
    grateful: { accentText: "text-green-500", accentBorder: "border-green-400/40", pill: "bg-green-50 dark:bg-green-950/30" },
    angry: { accentText: "text-orange-500", accentBorder: "border-orange-400/40", pill: "bg-orange-50 dark:bg-orange-950/30" },
    peaceful: { accentText: "text-teal-500", accentBorder: "border-teal-400/40", pill: "bg-teal-50 dark:bg-teal-950/30" },
    proud: { accentText: "text-purple-500", accentBorder: "border-purple-400/40", pill: "bg-purple-50 dark:bg-purple-950/30" },
    relieved: { accentText: "text-emerald-500", accentBorder: "border-emerald-400/40", pill: "bg-emerald-50 dark:bg-emerald-950/30" },
    default: { accentText: "text-muted-foreground", accentBorder: "border-border", pill: "bg-muted/30" },
};

function getMoodPalette(mood: string) {
    const lower = mood?.toLowerCase() ?? "";
    return (
        Object.entries(MOOD_PALETTES).find(([key]) => lower.includes(key))?.[1] ??
        MOOD_PALETTES.default
    );
}

/* ─── Word count ─────────────────────────────────────────────── */

function WordCount({ text }: { text: string }) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const minutes = Math.ceil(words / 200);
    return (
        <span className="text-xs text-muted-foreground font-sans tabular-nums">
            {words} words · {minutes} min read
        </span>
    );
}

/* ─── Media grid (edit mode) ─────────────────────────────────── */

function EditMediaGrid({
    items,
    onRemoveSaved,
    onRemoveStaged,
    uploading,
    apiUrl,
}: {
    items: MediaItem[];
    onRemoveSaved: (filename: string) => void;
    onRemoveStaged: (id: string) => void;
    uploading: boolean;
    apiUrl: string;
}) {
    if (items.length === 0) return null;

    return (
        <div className="mt-8 pt-6 border-t border-border/40">
            <p className="text-xs text-muted-foreground font-sans mb-3 uppercase tracking-wider">
                Attachments · {items.length}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {items.map((item) => {
                    const isStaged = item.kind === "staged";
                    const src = isStaged
                        ? item.data.previewUrl
                        : `${apiUrl}/download/${item.data.type}/${item.data.filename}`;
                    const fileType = item.data.type;
                    const progress = isStaged ? item.data.uploadProgress : 100;

                    return (
                        <div
                            key={isStaged ? item.data.id : item.data.filename}
                            className="relative group rounded-xl overflow-hidden aspect-square bg-muted/30 border border-border/50"
                        >
                            {fileType === "photos" ? (
                                <img src={src} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <video src={src} className="w-full h-full object-cover bg-black" muted />
                            )}

                            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/50 text-white rounded-md px-1.5 py-0.5 backdrop-blur-sm">
                                {fileType === "photos"
                                    ? <FileImage className="w-3 h-3" />
                                    : <FileVideo className="w-3 h-3" />
                                }
                                <span className="text-[10px] font-sans font-medium">
                                    {fileType === "photos" ? "Photo" : "Video"}
                                </span>
                            </div>

                            {isStaged && progress < 100 && progress >= 0 && !uploading && (
                                <div className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[10px] font-sans font-medium px-1.5 py-0.5 rounded-md">
                                    New
                                </div>
                            )}

                            {uploading && isStaged && progress < 100 && progress >= 0 && (
                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                                    <div className="w-3/4 h-1 bg-white/20 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-white rounded-full transition-all duration-300"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <span className="text-white text-[10px] font-sans">{progress}%</span>
                                </div>
                            )}

                            {progress === -1 && (
                                <div className="absolute inset-0 bg-destructive/60 flex items-center justify-center">
                                    <span className="text-white text-[10px] font-sans font-medium">Failed</span>
                                </div>
                            )}

                            {!uploading && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        isStaged
                                            ? onRemoveStaged(item.data.id)
                                            : onRemoveSaved(item.data.filename)
                                    }
                                    className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive backdrop-blur-sm"
                                    aria-label="Remove"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function EditJournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const entryId = resolvedParams.id;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

    const [entry, setEntry] = useState<JournalEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [editTitle, setEditTitle] = useState("");
    const [editMood, setEditMood] = useState("");
    const [editContent, setEditContent] = useState("");

    const [savedMedia, setSavedMedia] = useState<SavedMediaFile[]>([]);
    const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
    const [saving, setSaving] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const docRef = doc(db, "users", user.uid, "journals", entryId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const loaded: JournalEntry = {
                            id: docSnap.id,
                            title: data.title || "",
                            mood: data.mood || "",
                            content: data.content || "",
                            media: data.media || [],
                            userId: data.userId || "",
                            createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
                        };
                        setEntry(loaded);
                        setEditTitle(loaded.title);
                        setEditMood(loaded.mood);
                        setEditContent(loaded.content);
                        setSavedMedia(loaded.media);
                    }
                } catch (err) {
                    console.error(err);
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

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
        }
    }, [editContent]);

    useEffect(() => {
        return () => {
            stagedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        };
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: "photos" | "videos") => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles: StagedFile[] = Array.from(e.target.files).map((file) => ({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                file,
                type: fileType,
                previewUrl: URL.createObjectURL(file),
                uploadProgress: 0,
            }));
            setStagedFiles((prev) => [...prev, ...newFiles]);
        }
        e.target.value = "";
    };

    const [removedMedia, setRemovedMedia] = useState<SavedMediaFile[]>([]);

    const removeSaved = (filename: string) => {
        const file = savedMedia.find((f) => f.filename === filename);
        if (!file) return;
        setRemovedMedia((prev) => [...prev, file]);
        setSavedMedia((prev) => prev.filter((f) => f.filename !== filename));
    };


    const removeStaged = (id: string) => {
        setStagedFiles((prev) => {
            const f = prev.find((f) => f.id === id);
            if (f) URL.revokeObjectURL(f.previewUrl);
            return prev.filter((f) => f.id !== id);
        });
    };

    const uploadSingleFile = (staged: StagedFile): Promise<SavedMediaFile | null> => {
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

    const handleUpdate = async () => {
        if (!editTitle.trim() || !editContent.trim()) {
            setError("Title and content cannot be empty.");
            return;
        }

        setSaving(true);
        await Promise.allSettled(
            removedMedia.map((file) =>
                fetch(`${apiUrl}/delete/${file.type}/${file.filename}`, { method: "DELETE" })
            )
        );
        if (stagedFiles.length > 0) setUploadingMedia(true);
        setError("");

        try {
            const uploadResults = await Promise.all(stagedFiles.map(uploadSingleFile));
            const newlySaved: SavedMediaFile[] = uploadResults.filter(Boolean) as SavedMediaFile[];
            const failedCount = uploadResults.filter((r) => r === null).length;

            if (failedCount > 0) {
                setError(`${failedCount} file(s) failed to upload. Saved with successful uploads only.`);
            }

            setUploadingMedia(false);

            const allMedia = [...savedMedia, ...newlySaved];

            const docRef = doc(db, "users", auth.currentUser!.uid, "journals", entryId);
            await updateDoc(docRef, {
                title: editTitle,
                mood: editMood,
                content: editContent,
                media: allMedia,
                updatedAt: Date.now(),
            });

            router.push(`/journal/${entryId}`);
        } catch (err) {
            console.error(err);
            setError("Failed to update journal entry.");
            setSaving(false);
            setUploadingMedia(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background">
                <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
            </div>
        );
    }

    if (!entry || (auth.currentUser && entry.userId !== auth.currentUser.uid)) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background font-sans">
                <div className="text-center">
                    <p className="text-foreground mb-4">Entry not found or unauthorized.</p>
                    <Link href="/journal" className="text-sm underline text-muted-foreground">
                        Return to journal
                    </Link>
                </div>
            </div>
        );
    }

    const palette = getMoodPalette(editMood);
    const editItems: MediaItem[] = [
        ...savedMedia.map((d) => ({ kind: "saved" as const, data: d })),
        ...stagedFiles.map((d) => ({ kind: "staged" as const, data: d })),
    ];
    const hasNewFiles = stagedFiles.length > 0;

    return (
        <div className="flex-1 transition-colors duration-500 bg-background text-foreground font-serif">
            <div className="sticky top-14 z-10 backdrop-blur-sm border-b border-border/40 px-6 py-3 flex items-center justify-between bg-background/95">
                <Link
                    href={`/journal/${entryId}`}
                    className="text-sm flex items-center gap-1.5 opacity-50 hover:opacity-80 transition-opacity font-sans"
                >
                    ← Cancel
                </Link>
                <WordCount text={editContent} />
                <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium transition-opacity hover:opacity-90 disabled:opacity-50 font-sans flex items-center gap-2"
                >
                    {saving ? (
                        uploadingMedia ? (
                            <>
                                <Upload className="w-3.5 h-3.5 animate-bounce" />
                                Uploading…
                            </>
                        ) : "Saving…"
                    ) : (
                        <>
                            {hasNewFiles && <Upload className="w-3.5 h-3.5 opacity-70" />}
                            Save
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
                <div className="mb-8">
                    <input
                        type="text"
                        value={editMood}
                        onChange={(e) => setEditMood(e.target.value)}
                        placeholder="How are you feeling?"
                        className={`text-sm px-3 py-1.5 rounded-full border bg-transparent outline-none focus:ring-2 transition-all w-2/3 md:w-auto font-sans focus:ring-primary/20 ${palette.accentText} ${palette.accentBorder} ${palette.pill}`}
                    />
                </div>

                <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Give this entry a title…"
                    className="w-full bg-transparent outline-none text-4xl mb-8 font-light tracking-tight placeholder-muted-foreground/30 font-serif"
                />

                <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="What's on your mind today?"
                    className="w-full bg-transparent outline-none resize-none text-lg leading-[1.9] overflow-hidden flex-grow placeholder-muted-foreground/30 font-serif"
                    style={{ minHeight: "200px" }}
                />

                <EditMediaGrid
                    items={editItems}
                    onRemoveSaved={removeSaved}
                    onRemoveStaged={removeStaged}
                    uploading={uploadingMedia}
                    apiUrl={apiUrl}
                />

                <div className="flex items-center gap-1 mt-8 pt-4 border-t border-border/40">
                    <input type="file" accept="image/*" multiple className="hidden" ref={photoInputRef} onChange={(e) => handleFileChange(e, "photos")} />
                    <input type="file" accept="video/*" multiple className="hidden" ref={videoInputRef} onChange={(e) => handleFileChange(e, "videos")} />

                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={saving} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-sans px-3 py-2 rounded-lg hover:bg-muted/60 disabled:opacity-40">
                        <ImageIcon className="w-4 h-4" />
                        Photos
                    </button>

                    <button type="button" onClick={() => videoInputRef.current?.click()} disabled={saving} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-sans px-3 py-2 rounded-lg hover:bg-muted/60 disabled:opacity-40">
                        <VideoIcon className="w-4 h-4" />
                        Videos
                    </button>

                    {hasNewFiles && !saving && (
                        <span className="ml-auto text-xs text-muted-foreground font-sans">
                            {stagedFiles.length} new file{stagedFiles.length !== 1 ? "s" : ""} · uploaded on Save
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
        </div>
    );
}

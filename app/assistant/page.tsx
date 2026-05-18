'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

import { auth } from '@/firebase';
import { setAuthCookie } from '@/app/actions/auth';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ThemeToggle } from '@/components/theme-toggle';

type AudioRecorderType = InstanceType<
  typeof import('./src/audio/audio-recorder').AudioRecorder
>;

type AudioStreamerType = InstanceType<
  typeof import('./src/audio/audio-streamer').AudioStreamer
>;

type MediaHandlerType = InstanceType<
  typeof import('./src/media/media-handler').MediaHandler
>;

type GeminiAPIType = InstanceType<
  typeof import('./src/api/gemini-api').GeminiAPI
>;

interface LogEntry {
  id: number;
  text: string;
  type:
    | 'user'
    | 'gemini'
    | 'function'
    | 'params'
    | 'response'
    | 'interrupted'
    | 'system';
  timestamp: string;
}

const WS_ENDPOINT =
  process.env.NEXT_PUBLIC_WS_ENDPOINT || 'ws://localhost:8081';

export default function Page() {
  const [user, setUser] = useState<User | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isScreenActive, setIsScreenActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const router = useRouter();

  const audioRecorderRef = useRef<AudioRecorderType | null>(null);
  const audioStreamerRef = useRef<AudioStreamerType | null>(null);
  const mediaHandlerRef = useRef<MediaHandlerType | null>(null);
  const apiRef = useRef<GeminiAPIType | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const currentTurnRef = useRef(0);
  const lastAudioTurnRef = useRef(-1);

  const hasShownSpeakingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  const addLog = useCallback(
    (text: string, type: LogEntry['type']) => {
      const now = new Date();

      const timestamp = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          text,
          type,
          timestamp,
        },
      ]);
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    await setAuthCookie('');
    router.push('/');
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [logs]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const [
        { AudioRecorder },
        { AudioStreamer },
        { MediaHandler },
        { GeminiAPI },
        { base64ToArrayBuffer },
      ] = await Promise.all([
        import('./src/audio/audio-recorder'),
        import('./src/audio/audio-streamer'),
        import('./src/media/media-handler'),
        import('./src/api/gemini-api'),
        import('./src/utils/utils'),
      ]);

      if (!mounted) return;

      const audioContext = new (
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext: typeof AudioContext;
        }).webkitAudioContext
      )({
        sampleRate: 24000,
      });

      audioContextRef.current = audioContext;

      const audioRecorder = new AudioRecorder();
      audioRecorderRef.current = audioRecorder;

      const audioStreamer = new AudioStreamer(audioContext);
      audioStreamerRef.current = audioStreamer;

      const mediaHandler = new MediaHandler();
      mediaHandlerRef.current = mediaHandler;

      if (videoRef.current) {
        mediaHandler.initialize(videoRef.current);
      }
      // @ts-expect-error - GeminiAPI constructor infers endpoint as null
      const api = new GeminiAPI(WS_ENDPOINT);
      apiRef.current = api;

      api.onReady = () => {
        if (mounted) {
          setIsReady(true);
        }
      };
      // @ts-expect-error - GeminiAPI constructor infers endpoint as null
      api.onAudioData = async (audioData: string) => {
        if (!mounted) return;

        if (
          !isSpeakingRef.current ||
          lastAudioTurnRef.current !== currentTurnRef.current
        ) {
          addLog('Speaking...', 'gemini');

          isSpeakingRef.current = true;
          setIsSpeaking(true);

          lastAudioTurnRef.current = currentTurnRef.current;
        }

        try {
          const arrayBuffer = base64ToArrayBuffer(audioData);

          audioStreamer.addPCM16(new Uint8Array(arrayBuffer));
          audioStreamer.resume();
        } catch (error) {
          console.error('Audio playback error', error);
        }
      };
      // @ts-expect-error - GeminiAPI constructor infers endpoint as null
      api.onTextContent = (text: string) => {
        if (text.trim() && mounted) {
          addLog(text, 'gemini');
        }
      };

      api.onTurnComplete = () => {
        if (!mounted) return;

        addLog('Finished speaking', 'gemini');

        isSpeakingRef.current = false;
        setIsSpeaking(false);

        audioStreamer.complete();
      };

      api.onInterrupted = () => {
        if (!mounted) return;

        isSpeakingRef.current = false;
        setIsSpeaking(false);

        audioStreamer.stop();

        addLog('Response interrupted by user input', 'interrupted');
      };
      // @ts-expect-error - GeminiAPI constructor infers endpoint as null
      api.onFunctionCall = (data: {
        name: string;
        args: unknown;
      }) => {
        if (!mounted) return;

        addLog(data.name, 'function');
        addLog(JSON.stringify(data.args, null, 2), 'params');
      };
      // @ts-expect-error - GeminiAPI constructor infers endpoint as null

      api.onFunctionResponse = (data: unknown) => {
        if (!mounted) return;

        addLog(JSON.stringify(data, null, 2), 'response');
      };
    }

    init().catch(console.error);

    return () => {
      mounted = false;

      apiRef.current = null;
      audioRecorderRef.current = null;
      audioStreamerRef.current = null;
      mediaHandlerRef.current = null;
    };
  }, [addLog]);

  const startRecording = useCallback(async () => {
    const api = apiRef.current;
    const audioContext = audioContextRef.current;
    const audioRecorder = audioRecorderRef.current;
    const audioStreamer = audioStreamerRef.current;

    if (!api || !audioContext || !audioRecorder || !audioStreamer) {
      return;
    }

    if (isSpeakingRef.current) {
      audioStreamer.stop();

      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }

    try {
      await audioContext.resume();
      await audioRecorder.start();

      hasShownSpeakingRef.current = false;

      currentTurnRef.current++;

      audioRecorder.on('data', (base64Data: string) => {
        if (!hasShownSpeakingRef.current) {
          addLog('Speaking...', 'user');

          hasShownSpeakingRef.current = true;
        }

        api.sendAudioChunk(base64Data);
      });

      setIsRecording(true);
    } catch (error) {
      const err = error as Error;

      addLog(`Error: ${err.message}`, 'system');
    }
  }, [addLog]);

  const stopRecording = useCallback(() => {
    const api = apiRef.current;
    const audioRecorder = audioRecorderRef.current;
    const mediaHandler = mediaHandlerRef.current;

    if (!audioRecorder || !api) return;

    audioRecorder.stop();

    setIsRecording(false);

    hasShownSpeakingRef.current = false;

    addLog('Recording stopped', 'user');

    mediaHandler?.stopAll();

    setIsWebcamActive(false);
    setIsScreenActive(false);

    api.sendEndMessage();

    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, [addLog]);

  const toggleMic = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const toggleWebcam = useCallback(async () => {
    const mediaHandler = mediaHandlerRef.current;
    const api = apiRef.current;

    if (!mediaHandler || !api) return;

    if (isWebcamActive) {
      mediaHandler.stopAll();

      setIsWebcamActive(false);
    } else {
      const success = await mediaHandler.startWebcam();

      if (success) {
        setIsWebcamActive(true);

        mediaHandler.startFrameCapture((base64Image: string) => {
          api.sendImage(base64Image);
        });
      }
    }
  }, [isWebcamActive]);

  const toggleScreen = useCallback(async () => {
    const mediaHandler = mediaHandlerRef.current;
    const api = apiRef.current;

    if (!mediaHandler || !api) return;

    if (isScreenActive) {
      mediaHandler.stopAll();

      setIsScreenActive(false);
    } else {
      const success = await mediaHandler.startScreenShare();

      if (success) {
        setIsScreenActive(true);

        mediaHandler.startFrameCapture((base64Image: string) => {
          api.sendImage(base64Image);
        });
      }
    }
  }, [isScreenActive]);

  const sendText = useCallback(() => {
    const api = apiRef.current;

    const text = textInput.trim();

    if (!text || !api) return;

    setTextInput('');

    addLog(text, 'user');

    api.sendTextMessage(text);
  }, [textInput, addLog]);

  const interrupt = useCallback(() => {
    const audioStreamer = audioStreamerRef.current;
    const api = apiRef.current;

    if (!audioStreamer || !api) return;

    audioStreamer.stop();

    isSpeakingRef.current = false;
    setIsSpeaking(false);

    addLog('Response interrupted by user input', 'interrupted');
  }, [addLog]);

  const logTypeClass: Record<LogEntry['type'], string> = {
    user: 'border-l-2 border-blue-400 pl-3 text-foreground',
    gemini: 'border-l-2 border-emerald-500 pl-3 text-foreground',
    function: 'font-mono text-sm text-amber-700 dark:text-amber-400',
    params:
      'font-mono text-xs text-muted-foreground whitespace-pre-wrap',
    response:
      'font-mono text-xs text-violet-700 dark:text-violet-400 whitespace-pre-wrap',
    interrupted: 'italic text-rose-600 dark:text-rose-400 text-sm',
    system: 'italic text-muted-foreground text-sm',
  };

  const logBadgeClass: Record<LogEntry['type'], string> = {
    user: 'text-blue-600 dark:text-blue-400',
    gemini: 'text-emerald-600 dark:text-emerald-400',
    function: 'text-amber-600 dark:text-amber-400',
    params: 'text-muted-foreground',
    response: 'text-violet-600 dark:text-violet-400',
    interrupted: 'text-rose-500',
    system: 'text-muted-foreground',
  };

  const logPrefix: Record<LogEntry['type'], string> = {
    user: 'You',
    gemini: 'AI',
    function: 'Fn',
    params: '↳',
    response: 'Resp',
    interrupted: '⚡',
    system: 'Sys',
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between mx-auto px-4 md:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/journal"
              className="flex items-center gap-2 font-bold tracking-tight"
            >
              <div className="h-6 w-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs font-sans">
                R
              </div>

              <span className="hidden sm:inline-block">
                Reflect
              </span>
            </Link>

            <div className="w-px h-4 bg-border mx-1" />

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div
                className={`w-2 h-2 rounded-full ${
                  isReady ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
              />

              <span
                style={{
                  fontFamily:
                    "'Playfair Display', Georgia, serif",
                  fontWeight: 500,
                }}
                className="text-foreground text-base"
              >
                Assistant
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest ml-2">
              {isReady ? 'Connected' : 'Connecting…'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            <Link href="/journal">
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:flex"
              >
                Back to Journal
              </Button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user?.photoURL || ''}
                      alt={user?.displayName || 'User'}
                    />

                    <AvatarFallback>
                      {user?.email?.charAt(0).toUpperCase() ||
                        'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className="w-56"
                align="end"
                forceMount
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.displayName || 'Reflect Member'}
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
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Logs */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
          {logs.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-center py-20">
              <div className="text-4xl mb-2 opacity-30">◎</div>

              <p className="text-sm">
                Speak, type, or share your screen to begin
              </p>

              <p className="text-xs">Waiting for input</p>
            </div>
          )}

          {logs.map((log) => (
            <div
              key={log.id}
              className="flex gap-3 items-start text-sm"
            >
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums mt-0.5 w-[52px] text-right">
                {log.timestamp}
              </span>

              <span
                className={`shrink-0 text-[10px] font-medium tracking-widest uppercase mt-0.5 w-10 ${logBadgeClass[log.type]}`}
              >
                {logPrefix[log.type]}
              </span>

              <span
                className={`flex-1 leading-relaxed ${logTypeClass[log.type]}`}
              >
                {log.text}
              </span>
            </div>
          ))}

          <div ref={logsEndRef} />
        </div>

        {/* Video Preview */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={
            isWebcamActive || isScreenActive
              ? 'mx-6 mb-2 rounded-xl border border-border max-h-40 object-cover'
              : 'hidden'
          }
        />

        {/* Controls */}
        <div className="border-t border-border px-6 py-4 bg-background">
          <div className="flex items-center gap-2">
            {/* Mic */}
            <button
              onClick={toggleMic}
              disabled={!isReady}
              title={
                isRecording
                  ? 'Stop recording'
                  : 'Start recording'
              }
              className={[
                'w-11 h-11 rounded-xl border flex items-center justify-center text-base transition-all duration-150 shrink-0',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                isRecording
                  ? 'bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700'
                  : 'bg-card border-border hover:bg-muted',
              ].join(' ')}
            >
              {isRecording ? '⏹' : '🎤'}
            </button>

            {/* Webcam */}
            <button
              onClick={toggleWebcam}
              title={
                isWebcamActive
                  ? 'Stop webcam'
                  : 'Start webcam'
              }
              className={[
                'w-11 h-11 rounded-xl border flex items-center justify-center text-base transition-all duration-150 shrink-0',
                isWebcamActive
                  ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:border-emerald-700'
                  : 'bg-card border-border hover:bg-muted',
              ].join(' ')}
            >
              {isWebcamActive ? '📵' : '📷'}
            </button>

            {/* Screen Share */}
            <button
              onClick={toggleScreen}
              title={
                isScreenActive
                  ? 'Stop sharing'
                  : 'Share screen'
              }
              className={[
                'w-11 h-11 rounded-xl border flex items-center justify-center text-base transition-all duration-150 shrink-0',
                isScreenActive
                  ? 'bg-purple-50 border-purple-300 dark:bg-purple-950 dark:border-purple-700'
                  : 'bg-card border-border hover:bg-muted',
              ].join(' ')}
            >
              {isScreenActive ? '🚫' : '🖥'}
            </button>

            {/* Text Input */}
            <div className="flex-1 flex items-center gap-2 bg-muted border border-border rounded-xl px-4 h-11 focus-within:bg-card focus-within:border-input transition-colors">
              <input
                type="text"
                value={textInput}
                onChange={(e) =>
                  setTextInput(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    sendText();
                  }
                }}
                placeholder="Type a message…"
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                style={{
                  fontFamily: "'Inter', sans-serif",
                }}
              />

              <button
                onClick={sendText}
                disabled={!textInput.trim()}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base"
              >
                ↵
              </button>
            </div>

            {/* Interrupt */}
            {isSpeaking && (
              <button
                onClick={interrupt}
                title="Interrupt response"
                className="w-11 h-11 rounded-xl border flex items-center justify-center text-base transition-all duration-150 shrink-0 bg-rose-50 border-rose-300 dark:bg-rose-950 dark:border-rose-700"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Bar */}
          <div className="mt-2.5 flex items-center gap-4">
            {isRecording && (
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-blue-600 dark:text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Rec
              </span>
            )}

            {isSpeaking && (
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                AI speaking
              </span>
            )}

            {isWebcamActive && (
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Webcam
              </span>
            )}

            {isScreenActive && (
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-purple-600 dark:text-purple-400">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                Screen share
              </span>
            )}

            {!isRecording &&
              !isSpeaking &&
              !isWebcamActive &&
              !isScreenActive && (
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Idle
                </span>
              )}
          </div>
        </div>
      </main>
    </div>
  );
}
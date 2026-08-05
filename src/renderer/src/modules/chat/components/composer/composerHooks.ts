import { useCallback, useRef, useState } from "react";

/**
 * Up/Down arrow prompt history within the current session.
 */
export function useInputHistory(max = 50): {
  push: (text: string) => void;
  older: (current: string) => string | null;
  newer: () => string | null;
  resetCursor: () => void;
} {
  const historyRef = useRef<string[]>([]);
  const cursorRef = useRef(-1);
  const draftRef = useRef("");

  const push = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const hist = historyRef.current;
      if (hist[hist.length - 1] === trimmed) return;
      hist.push(trimmed);
      if (hist.length > max) hist.shift();
      cursorRef.current = -1;
      draftRef.current = "";
    },
    [max],
  );

  const older = useCallback((current: string): string | null => {
    const hist = historyRef.current;
    if (hist.length === 0) return null;
    if (cursorRef.current === -1) {
      draftRef.current = current;
      cursorRef.current = hist.length - 1;
      return hist[cursorRef.current] ?? null;
    }
    if (cursorRef.current <= 0) return hist[0] ?? null;
    cursorRef.current -= 1;
    return hist[cursorRef.current] ?? null;
  }, []);

  const newer = useCallback((): string | null => {
    const hist = historyRef.current;
    if (cursorRef.current === -1) return null;
    if (cursorRef.current >= hist.length - 1) {
      cursorRef.current = -1;
      return draftRef.current;
    }
    cursorRef.current += 1;
    return hist[cursorRef.current] ?? null;
  }, []);

  const resetCursor = useCallback(() => {
    cursorRef.current = -1;
    draftRef.current = "";
  }, []);

  return { push, older, newer, resetCursor };
}

type SpeechRecLike = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecCtor = new () => SpeechRecLike;

function getSpeechCtor(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Lightweight SpeechRecognition wrapper — noop when unsupported. */
export function useVoiceInput(onTranscript: (text: string) => void): {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
} {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecLike | null>(null);
  const SpeechRecognitionCtor = getSpeechCtor();
  const supported = !!SpeechRecognitionCtor;

  const toggle = useCallback(() => {
    if (!SpeechRecognitionCtor) return;
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRecognitionCtor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript || "";
      if (text) onTranscript(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [SpeechRecognitionCtor, listening, onTranscript]);

  return { supported, listening, toggle };
}

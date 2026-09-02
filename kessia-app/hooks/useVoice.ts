// ============================================================
// KESSIA — Voix (dictée + lecture) via Web Speech API (§17, §34)
//
// Progressive enhancement, 100 % navigateur, aucune dépendance
// externe. Se désactive proprement si l'API n'est pas disponible.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type RecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type RecognitionEvent = { results: ArrayLike<RecognitionResult>; resultIndex: number };
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => RecognitionLike) | null;
}

export function useVoice(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const sttSupported = typeof window !== 'undefined' && getRecognitionCtor() !== null;
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text.trim()) onTranscriptRef.current(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return { sttSupported, ttsSupported, listening, speaking, startListening, stopListening, speak, stopSpeaking };
}

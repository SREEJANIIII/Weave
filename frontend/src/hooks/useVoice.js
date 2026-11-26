import { useCallback, useEffect, useRef, useState } from 'react';

const ERRORS = {
  'not-allowed': 'Weave needs your permission to use the microphone. You can allow it in your browser’s site settings.',
  'service-not-allowed': 'This browser won’t let Weave use voice right now. You can type your question instead.',
  'no-speech': 'I didn’t hear anything. Tap the microphone and try again.',
  'audio-capture': 'I couldn’t find a microphone. Check that one is connected.',
  network: 'Voice needs an internet connection in this browser. You can type your question instead.',
};

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/** Speech to text with the browser's own recogniser. `onFinal(text)` runs once the person stops talking. */
export function useVoice({ onFinal }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const finalRef = useRef('');
  const cancelledRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!Recognition) {
      setError('Voice isn’t available in this browser. Try Chrome or Safari, or type your question.');
      return;
    }
    recRef.current?.abort();
    const rec = new Recognition();
    rec.lang = navigator.language || 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    finalRef.current = '';
    cancelledRef.current = false;
    setHeard('');
    setError('');
    rec.onresult = (event) => {
      let interim = '';
      let final = '';
      for (const result of event.results) {
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      finalRef.current = final;
      setHeard((final + interim).trim());
    };
    rec.onerror = (event) => {
      if (event.error === 'aborted') return;
      setError(ERRORS[event.error] ?? 'Voice stopped working. You can type your question instead.');
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const text = finalRef.current.trim();
      if (text && !cancelledRef.current) onFinalRef.current?.(text);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('Voice couldn’t start. Try again in a moment.');
    }
  }, []);

  /** Stop listening and use what was heard. */
  const stop = useCallback(() => recRef.current?.stop(), []);

  /** Stop listening and throw away what was heard. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    recRef.current?.abort();
    setListening(false);
    setHeard('');
  }, []);

  return { supported: Boolean(Recognition), listening, heard, error, clearError: () => setError(''), start, stop, cancel };
}

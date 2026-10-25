import { useEffect, useRef, useState } from 'react';
import type { Message } from './database';
import { TranslationClient } from './TranslationClient';
import type { Language } from './translation';
import { errorMessage } from './useChat';

export type IncomingTranslation =
  | { phase: 'queued' | 'working'; message: string }
  | { phase: 'done'; text: string }
  | { phase: 'error'; message: string };

export function shouldTranslate(message: Message, userId: string, target: Language): boolean {
  return message.sender_id !== userId && message.language !== target;
}

export function useIncomingTranslations(
  messages: Message[], userId: string, target: Language, enabled: boolean,
) {
  const [translations, setTranslations] = useState<Record<string, IncomingTranslation>>({});
  const [revision, setRevision] = useState(0);
  const client = useRef<TranslationClient | null>(null);
  const jobs = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => {
    const engine = new TranslationClient();
    client.current = engine;
    jobs.current.clear();
    setTranslations({});
    generation.current += 1;
    return () => {
      generation.current += 1;
      engine.cancel();
      client.current = null;
    };
  }, [userId, target, enabled]);

  useEffect(() => {
    const engine = client.current;
    if (!enabled || !engine) return;
    const current = generation.current;
    for (const message of messages) {
      if (!shouldTranslate(message, userId, target) || jobs.current.has(message.id)) continue;
      jobs.current.add(message.id);
      const update = (value: IncomingTranslation) => {
        if (current === generation.current) {
          setTranslations((previous) => ({ ...previous, [message.id]: value }));
        }
      };
      update({ phase: 'queued', message: 'Traduction en attente…' });
      void engine.translate(message.body, message.language, (status) => {
        update({ phase: 'working', message: status });
      }).then((text) => update({ phase: 'done', text })).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        update({ phase: 'error', message: errorMessage(error) });
      });
    }
  }, [messages, userId, target, enabled, revision]);

  function retry(id: string) {
    jobs.current.delete(id);
    setRevision((previous) => previous + 1);
  }

  return { translations, retry };
}

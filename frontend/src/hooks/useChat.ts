import { useEffect, useRef, useState } from 'react';
import { chat } from '../api/chat';
import type { ChatMessage, ChatResponse } from '../types/contract';
import { useT } from '../i18n';
type Entry = ChatMessage & { response?: ChatResponse };
export function useChat(marketId: string, itemId?: string) {
  const key = `chat:${marketId}:${itemId ?? ''}`;
  const t = useT();
  const [entries, setEntries] = useState<Entry[]>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
      return Array.isArray(saved) &&
        saved.every(
          (e) =>
            e &&
            ['user', 'assistant'].includes(e.role) &&
            typeof e.content === 'string' &&
            (!e.response ||
              (Array.isArray(e.response.tools) &&
                Array.isArray(e.response.citations) &&
                Array.isArray(e.response.items))),
        )
        ? saved
        : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(entries));
    } catch {
      /* memory only */
    }
  }, [key, entries]);
  async function send(text = input) {
    if (busy.current || !text.trim() || text.length > 500) return;
    busy.current = true;
    setLoading(true);
    setError('');
    const next: Entry[] = [...entries, { role: 'user', content: text.trim() }];
    setEntries(next);
    setInput('');
    try {
      const response = await chat({
        market_id: marketId,
        item_id: itemId,
        messages: next.slice(-9).map(({ role, content, response }) => ({
          role,
          content: content.slice(0, 500),
          ...(role === 'assistant' && response?.reply_sig ? { sig: response.reply_sig } : {}),
        })),
      });
      setEntries([...next, { role: 'assistant', content: response.reply, response }]);
    } catch (e) {
      const failure = e as { status?: number; message?: string };
      setEntries(entries);
      setInput(text);
      setError(
        failure.status === 503
          ? t('askUnavailable')
          : failure.status === 429
            ? t('askRateLimit')
            : failure.message || t('askError'),
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  return {
    entries,
    input,
    setInput,
    loading,
    error,
    send,
    reset: () => {
      if (!busy.current) {
        setEntries([]);
        setInput('');
        setError('');
      }
    },
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveSales, getPublicStore, viewSale } from '../api/sales';
import { useResource } from './useResource';
import { seoulDay } from '../utils/sale';
const counted = new Set<string>();
const inflight = new Set<string>();
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
export function useActiveSales(market?: string) {
  const state = useResource(useCallback(() => getActiveSales(market), [market]));
  const now = useNow();
  return {
    ...state,
    data:
      state.data?.filter(
        (s) =>
          s.status === 'active' && Date.parse(s.starts_at) <= now && Date.parse(s.ends_at) > now,
      ) ?? null,
  };
}
export function usePublicStore(id: string) {
  const state = useResource(useCallback(() => getPublicStore(id), [id]));
  const now = useNow();
  return {
    ...state,
    data: state.data
      ? {
          ...state.data,
          sales: state.data.sales.filter(
            (s) => s.status === 'active' && Date.parse(s.ends_at) > now,
          ),
        }
      : null,
  };
}
export function useSaleView(id: number) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const count = async () => {
      const key = `sale-view:${seoulDay()}:${id}`;
      if (counted.has(key) || inflight.has(key)) return;
      try {
        if (localStorage.getItem(key)) return;
      } catch {
        /* unavailable */
      }
      inflight.add(key);
      try {
        await viewSale(id);
        counted.add(key);
        try {
          localStorage.setItem(key, '1');
        } catch {
          /* unavailable */
        }
      } catch {
        /* retry on next visibility */
      } finally {
        inflight.delete(key);
      }
    };
    if (!ref.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void count();
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [id]);
  return ref;
}

import { createContext, useContext, useEffect, useState } from 'react';
import type { Language, Market } from '../types/contract';
type Theme = 'system' | 'light' | 'dark';
const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be unavailable. */
  }
};
export const useSessionState = () => {
  const [market, setMarket] = useState<Market | null>(() => read('market', null));
  const [language, setLanguage] = useState<Language>(() => read('language', 'ko'));
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem('theme');
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    write('market', market);
  }, [market]);
  useEffect(() => {
    write('language', language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    try {
      if (theme === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', theme);
    } catch {
      /* Storage may be unavailable. */
    }
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return { market, setMarket, language, setLanguage, theme, setTheme };
};
export const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export const useSession = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider required');
  return session;
};

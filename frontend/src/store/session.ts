import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { getMarkets } from '../api/markets';
import { seoulDay } from '../utils/sale';
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
  const manuallyChosen = useRef(false);
  const [market, updateMarket] = useState<Market | null>(() =>
    read('market-day', '') === seoulDay() ? read('market', null) : null,
  );
  const [marketLoading, setMarketLoading] = useState(true);
  const [automatic, setAutomatic] = useState(false);
  const [storeContext, setStoreContext] = useState<{ store_id: string; market_id: string } | null>(
    null,
  );
  const setMarket = (value: Market) => {
    manuallyChosen.current = true;
    updateMarket(value);
    setAutomatic(false);
    setStoreContext((current) => (current?.market_id === value.market_id ? current : null));
    write('market-day', seoulDay());
  };
  useEffect(() => {
    let active = true;
    if (market) {
      setMarketLoading(false);
      return;
    }
    const finish = () => {
      if (active) setMarketLoading(false);
    };
    if (!navigator.geolocation) {
      finish();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const markets = await getMarkets(coords.latitude, coords.longitude);
          const nearest = markets
            .filter((m) => m.distance_m !== null)
            .sort((a, b) => a.distance_m! - b.distance_m!)[0];
          if (active && !manuallyChosen.current && nearest && nearest.distance_m! <= 1000) {
            updateMarket(nearest);
            setAutomatic(true);
          }
        } catch {
          /* show market list */
        } finally {
          finish();
        }
      },
      finish,
      { timeout: 5000 },
    );
    return () => {
      active = false;
    };
    // Startup selection runs once; manual choices take priority afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  return {
    market,
    setMarket,
    marketLoading,
    automatic,
    storeContext,
    setStoreContext,
    language,
    setLanguage,
    theme,
    setTheme,
  };
};
export const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export const useSession = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider required');
  return session;
};

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { getMarkets } from '../api/markets';
import { seoulDay } from '../utils/sale';
import type { Language, Market } from '../types/contract';
type Theme = 'system' | 'light' | 'dark';
export type TextSize = 'normal' | 'large' | 'xlarge';
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
    read('market-day', '') === seoulDay() &&
    read<Market | null>('market', null)?.status !== 'listed'
      ? read('market', null)
      : null,
  );
  const [marketLoading, setMarketLoading] = useState(true);
  const [unsupported, setUnsupported] = useState<Market | null>(null);
  const [nearbyActive, setNearbyActive] = useState<Market | null>(null);
  const [automatic, setAutomatic] = useState(false);
  const [storeContext, setStoreContext] = useState<{ store_id: string; market_id: string } | null>(
    null,
  );
  const setMarket = (value: Market) => {
    if (value.status === 'listed') return;
    setUnsupported(null);
    manuallyChosen.current = true;
    updateMarket(value);
    setAutomatic(false);
    setStoreContext((current) => (current?.market_id === value.market_id ? current : null));
    write('market-day', seoulDay());
  };
  useEffect(() => {
    let active = true;
    const requested = new URLSearchParams(window.location.search).get('market');
    if (requested) {
      void getMarkets()
        .then((markets) => {
          const selected = markets.find((m) => m.market_id === requested && m.status === 'active');
          if (active && !manuallyChosen.current && selected) {
            setMarket(selected);
          }
        })
        .catch(() => {
          /* market list remains available */
        })
        .finally(() => {
          if (active) setMarketLoading(false);
        });
      return () => {
        active = false;
      };
    }
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
          if (active && !manuallyChosen.current) {
            setNearbyActive(markets.find((m) => m.status === 'active') ?? null);
            if (nearest?.status === 'listed' && nearest.distance_m! <= 1000) {
              setUnsupported(nearest);
              return;
            }
          }
          if (
            active &&
            !manuallyChosen.current &&
            nearest?.status === 'active' &&
            nearest &&
            nearest.distance_m! <= 1000
          ) {
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
  // 글자 크기(030 Settings): <html data-text-size>로 가격·확인 포인트부터 키움
  const [textSize, setTextSize] = useState<TextSize>(() => {
    const v = read<string>('text-size', 'normal');
    return v === 'large' || v === 'xlarge' ? v : 'normal';
  });
  useEffect(() => {
    write('text-size', textSize);
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);
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
    unsupported,
    nearbyActive,
    setMarket,
    marketLoading,
    automatic,
    storeContext,
    setStoreContext,
    language,
    setLanguage,
    theme,
    setTheme,
    textSize,
    setTextSize,
  };
};
export const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export const useSession = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider required');
  return session;
};

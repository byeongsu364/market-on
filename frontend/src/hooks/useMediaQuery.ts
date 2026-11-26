import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      // 오래된 브라우저나 테스트 대역에서는 matchMedia 결과가 비어 있을 수 있음
      const media = window.matchMedia(query);
      media?.addEventListener?.('change', notify);
      return () => media?.removeEventListener?.('change', notify);
    },
    () => (typeof window.matchMedia === 'function' ? !!window.matchMedia(query)?.matches : false),
    () => false,
  );
}
/** 1024px 이상은 일반 웹(상단 머리말), 미만은 앱(하단 탭) */
export const DESKTOP_QUERY = '(min-width: 1024px)';
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);

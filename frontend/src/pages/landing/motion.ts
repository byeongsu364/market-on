import { createContext, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { enablePcApp } from '../../components/layout/desktopGate';
import { APP_START } from './facts';

/**
 * 소개 사이트의 발표 모드와 움직임(개발 전달 메모 2026-11-27 "2. 발표 모드 동작").
 * - ↓ · PageDown · Space로 다음 섹션 머리, ↑ · PageUp · Shift+Space로 이전 섹션 머리
 * - 지금 보이는 섹션을 IntersectionObserver로 찾아 메뉴에 표시하고 주소의 #해시를 바꿈
 * - 숫자 카운트업은 화면에 들어올 때 1.2초 한 번
 * - prefers-reduced-motion이면 부드러운 이동·카운트업 없이 바로
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function reducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && !!window.matchMedia(REDUCED_QUERY)?.matches;
  } catch {
    return false;
  }
}

/** 지금 보이는 섹션(data-stop)의 id. 기능 페이지 목차가 씀 */
export const ActiveStopContext = createContext<string | null>(null);

/**
 * 섹션 머리까지 남은 거리(px, 지금 위치 기준)로 다음(1)·이전(-1) 섹션 번호를 고름. 없으면 -1.
 * 머리가 이미 화면 위 끝(머리말 바로 아래)에 있으면 그 섹션은 건너뜀.
 */
export function nextStop(heads: readonly number[], dir: 1 | -1): number {
  const EPS = 4;
  if (dir > 0) return heads.findIndex((h) => h > EPS);
  for (let i = heads.length - 1; i >= 0; i--) if (heads[i] < -EPS) return i;
  return -1;
}

/** 한 번에 움직일 거리. 화면보다 긴 섹션은 한 화면씩 넘겨 가며 머리에서 멈춤 */
export function stepDistance(head: number, page: number): number {
  const limit = Math.max(200, page);
  return head > 0 ? Math.min(head, limit) : Math.max(head, -limit);
}

const marginOf = (el: Element) => parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
const behavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth');

/** 주소의 #해시만 바꿈(라우터 이동 없이, 뒤로 가기 기록을 늘리지 않음) */
export function replaceHash(id: string | null) {
  const { pathname, search, hash } = window.location;
  const next = id ? `#${id}` : '';
  if (hash === next) return;
  window.history.replaceState(window.history.state, '', pathname + search + next);
}

/** 같은 페이지의 #앵커로 부드럽게 이동 */
export function jumpTo(el: HTMLElement, opts: { focus?: boolean } = {}) {
  el.scrollIntoView?.({ behavior: behavior(), block: 'start' });
  if (opts.focus) el.focus?.({ preventScroll: true });
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * 발표 모드: 키보드로 섹션 넘기기 + 지금 섹션 찾기 + 주소 해시 갱신.
 * root 안의 [data-stop] 요소가 섹션 머리예요(scroll-margin-top은 CSS에서).
 */
export function usePresentation(root: RefObject<HTMLElement | null>, page: string) {
  const [active, setActive] = useState<string | null>(null);
  const pending = useRef<{ top: number; at: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      let dir: 1 | -1 | 0 = 0;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
      else if (e.key === ' ' || e.key === 'Spacebar') {
        // 버튼·링크·질문 열기에서는 Space 본래 동작
        if (e.target instanceof Element && e.target.closest('a,button,summary,video,[role=button]'))
          return;
        dir = e.shiftKey ? -1 : 1;
      }
      if (!dir || !root.current) return;
      const stops = Array.from(root.current.querySelectorAll<HTMLElement>('[data-stop]'));
      if (!stops.length) return;
      const now = performance.now();
      // 부드럽게 움직이는 중에 또 누르면 가는 곳을 기준으로 다음 섹션
      const base =
        pending.current && now - pending.current.at < 700 ? pending.current.top : window.scrollY;
      const heads = stops.map(
        (el) => el.getBoundingClientRect().top + window.scrollY - marginOf(el) - base,
      );
      const i = nextStop(heads, dir);
      if (i < 0) return;
      e.preventDefault();
      const page = (window.innerHeight - marginOf(stops[i])) * 0.85;
      const top = Math.max(0, base + stepDistance(heads[i], page));
      pending.current = { top, at: now };
      window.scrollTo({ top, behavior: behavior() });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [root]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const stops = Array.from(el.querySelectorAll<HTMLElement>('[data-stop]'));
    if (!stops.length) return;
    // 화면 위에서 35% 지점을 지나는 섹션이 "지금 섹션"
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)?.target as HTMLElement | undefined;
        if (!hit) return;
        setActive(hit.id || null);
        if (hit === stops[0]) replaceHash(null);
        else if (hit.id) replaceHash(hit.id);
      },
      { rootMargin: '-35% 0px -64% 0px' },
    );
    stops.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [root, page]);

  return active;
}

/** 숫자 카운트업: 화면에 들어오면 0에서 목표까지 한 번(기본 1.2초) */
export function useCountUp(target: number, duration = 1200) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(target);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function' || reducedMotion()) return;
    let raf = 0;
    setValue(0);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, duration]);
  return [ref, value] as const;
}

/**
 * [웹으로 시작하기]: 이 탭에서는 PC에서도 앱을 보이게 하고(desktopGate) 같은 탭에서 경동시장을 엶.
 * PC 첫 화면(/)은 이후 앱이 되므로, 뒤로 가기가 소개로 돌아오게 지금 기록을 /intro로 바꿔 둠.
 */
export function useStartWeb() {
  const navigate = useNavigate();
  return (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    enablePcApp();
    const { pathname, hash } = window.location;
    if (pathname === '/') window.history.replaceState(window.history.state, '', `/intro${hash}`);
    navigate(APP_START);
  };
}

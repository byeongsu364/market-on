import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { showLanding } from '../../components/layout/desktopGate';
import { APP_START } from './facts';
import { ActiveStopContext, jumpTo, replaceHash, usePresentation, useStartWeb } from './motion';
import s from './brand.module.css';

/**
 * 소개 사이트(PC 발표용) 공통 틀(2026-11-27 디자인 시안 marketon_site_v1).
 * 상단 고정 탭 4개(지금 탭만 ink 600 + 밑줄 + 주황 점), 오른쪽 [웹으로 시작하기], 공통 아래 끝 줄.
 * 발표 모드(키보드로 섹션 넘기기, 지금 섹션 표시, 주소 #해시)는 motion.ts.
 * 이 사이트는 늘 밝은 화면이에요(디자인의 마무리 띠만 어두운 면).
 */
type Page = 'home' | 'features' | 'download' | 'team';

const TABS: { page: Page; label: string; to?: string }[] = [
  { page: 'home', label: '홈' },
  { page: 'features', label: '기능', to: '/intro/features' },
  { page: 'download', label: '다운로드', to: '/intro/download' },
  { page: 'team', label: '팀 소개', to: '/intro/team' },
];

/** 문서 전체를 밝은 화면 + 섹션 붙음으로(소개 사이트가 떠 있는 동안만) */
function useBrandDocument() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.dataset.theme;
    const light = () => {
      html.dataset.theme = 'light';
    };
    light();
    // 세션 설정(store/session)이 처음 그릴 때 바깥 effect에서 테마를 다시 쓰므로 한 번 더
    const again = window.setTimeout(light, 0);
    html.classList.add(s.docRoot);
    return () => {
      window.clearTimeout(again);
      html.classList.remove(s.docRoot);
      if (prev) html.dataset.theme = prev;
      else delete html.dataset.theme;
    };
  }, []);
}

/** 페이지를 옮기면 맨 위로, 주소에 #해시가 있으면 그 섹션으로(뒤로 가기로 돌아올 때 포함) */
function useScrollOnNavigate() {
  const { pathname, hash, key } = useLocation();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const samePage = prev.current === pathname;
    prev.current = pathname;
    const id = hash ? decodeURIComponent(hash.slice(1)) : '';
    const el = id ? document.getElementById(id) : null;
    if (el) {
      if (samePage) jumpTo(el);
      else el.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    } else if (!samePage) window.scrollTo?.(0, 0);
  }, [pathname, hash, key]);
}

export default function BrandLayout({ page, children }: { page: Page; children: ReactNode }) {
  const { pathname } = useLocation();
  const desktop = useIsDesktop();
  const root = useRef<HTMLDivElement>(null);
  const active = usePresentation(root, pathname);
  const startWeb = useStartWeb();
  useBrandDocument();
  useScrollOnNavigate();
  // PC 첫 화면(/)이 소개일 때는 /, 이 탭이 앱으로 바뀐 뒤나 휴대폰에서는 늘 소개인 /intro
  const homeHref = showLanding('/', desktop) ? '/' : '/intro';

  // 같은 페이지 #앵커(목차 칩, 건너뛰기 등): 부드럽게 옮기고 주소 해시만 바꿈
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const a = (e.target as Element).closest?.('a[href^="#"]');
    const id = a?.getAttribute('href')?.slice(1);
    const el = id ? document.getElementById(decodeURIComponent(id)) : null;
    if (!el || !root.current?.contains(el)) return;
    e.preventDefault();
    jumpTo(el, { focus: el.tagName === 'MAIN' });
    if (el.hasAttribute('data-stop'))
      replaceHash(el === root.current.querySelector('[data-stop]') ? null : el.id);
  };

  return (
    // 클릭 위임은 안쪽의 #앵커 링크(a)에만 반응
    <div ref={root} className={s.page} data-theme="light" lang="ko" onClick={onClick}>
      <a href="#main" className={s.skip}>
        본문으로 건너뛰기
      </a>
      <header className={s.header}>
        <nav aria-label="주요 메뉴" className={s.headerRow}>
          <Link to={homeHref} className={s.logo}>
            <img src="/brand/mark-tight.svg" alt="" width={33} height={19} />
            <span className={s.logoText}>Market-On</span>
          </Link>
          <div className={s.tabs}>
            {TABS.map((t) => (
              <Link
                key={t.page}
                to={t.to ?? homeHref}
                className={s.tab}
                aria-current={t.page === page ? 'page' : undefined}
              >
                {t.page === page && <span className={s.dot} aria-hidden="true" />}
                {t.label}
              </Link>
            ))}
          </div>
          <a href={APP_START} className={s.headerCta} onClick={startWeb}>
            웹으로 시작하기
          </a>
        </nav>
      </header>
      <ActiveStopContext.Provider value={active}>
        <main id="main" tabIndex={-1} className={s.main}>
          {children}
        </main>
      </ActiveStopContext.Provider>
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerBrand}>
            <span className={s.footerLogo}>
              <img src="/brand/mark-tight.svg" alt="" width={33} height={19} />
              <span>Market-On</span>
            </span>
            <span className={s.footerTag}>전통시장에 불을 켜다 · 경복대학교 Market-On 팀</span>
            {/* 영상·안심On 화면 속 귤 사진의 출처(CC BY-SA 2.0, 가격표는 팀이 덧붙임) */}
            <span className={s.footerTag}>
              화면 속 귤 사진: Tamago Moffle,{' '}
              <a
                href="https://commons.wikimedia.org/wiki/File:Citrus_shop_-Nara.jpg"
                target="_blank"
                rel="noopener noreferrer"
              >
                Citrus shop -Nara
              </a>{' '}
              (CC BY-SA 2.0, 가격표 합성)
            </span>
          </div>
          <nav aria-label="아래 메뉴" className={s.footerNav}>
            {TABS.map((t) => (
              <Link key={t.page} to={t.to ?? homeHref}>
                {t.label}
              </Link>
            ))}
          </nav>
          <Link to="/intro/features#sources" className={s.footerSources}>
            쓰는 자료: aT · 소상공인시장진흥공단 · 농촌진흥청 · 카카오 · 네이버 · 출처 전체 보기
          </Link>
        </div>
      </footer>
    </div>
  );
}

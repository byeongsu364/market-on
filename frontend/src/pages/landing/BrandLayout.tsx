import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FEATURES } from './features';
import s from './landing.module.css';

/** PC 소개 사이트의 공통 틀: 위 메뉴(기능별 소개 페이지)와 아래 끝 줄(2026-11-27) */
export default function BrandLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [pathname]);
  return (
    // 소개 사이트는 늘 밝은 화면(로고·캡처가 흰 바탕 기준)
    <div className={s.page} data-theme="light">
      <a href="#main" className="sr-only">
        본문으로 건너뛰기
      </a>
      <header className={s.header}>
        <Link to="/" className={s.logo} aria-label="Market-On 소개 처음으로">
          <img src="/brand/logo-light.svg" alt="" />
        </Link>
        <nav className={s.nav} aria-label="기능 소개">
          {FEATURES.map((f) => (
            <NavLink
              key={f.slug}
              to={`/intro/${f.slug}`}
              className={({ isActive }) => (isActive ? s.navOn : undefined)}
            >
              {f.menu}
            </NavLink>
          ))}
          <Link to="/login" className={s.navLogin}>
            로그인
          </Link>
        </nav>
      </header>
      {children}
      <footer className={s.footer}>
        <div className={s.footerRow}>
          <img src="/brand/logo-light.svg" alt="Market-On" className={s.footerLogo} />
          <nav className={s.footerNav} aria-label="기능 소개(아래)">
            {FEATURES.map((f) => (
              <Link key={f.slug} to={`/intro/${f.slug}`}>
                {f.menu}
              </Link>
            ))}
          </nav>
        </div>
        <p>경복대학교 Market-On 팀 · 2026 AID 전환 바이브톤 경진대회 출품작</p>
        <p className={s.footerNote}>
          화면 캡처는 실제 서비스 화면이에요. 가격은 aT 조사값이며 점포의 실제 판매가와 다를 수
          있어요.
        </p>
      </footer>
    </div>
  );
}

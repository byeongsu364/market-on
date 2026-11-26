import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import Icon from '../common/Icon';
import { useAuth } from '../../hooks/useAuth';
import { useSession } from '../../store/session';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { LANGUAGE_NAMES } from '../../pages/me/languages';
import s from './layout.module.css';

// PC 머리말: 로고, 지도·장보기·상인·시장, 검색창, 언어, 로그인, 사진으로 확인하기
export default function WebHeader() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useSession();
  const ctx = useShoppingContext();
  const [q, setQ] = useState(() => new URLSearchParams(search).get('q') ?? '');
  const section = pathname.startsWith('/shop')
    ? 'shop'
    : /^\/(merchant|join|market-admin|admin|signup\/merchant)/.test(pathname)
      ? 'merchant'
      : pathname === '/' || pathname === '/markets' || pathname.startsWith('/s/')
        ? 'map'
        : '';
  const merchantHref =
    user?.role === 'merchant'
      ? '/merchant'
      : user?.role === 'market_admin'
        ? '/market-admin'
        : user?.role === 'operator'
          ? '/admin'
          : '/join';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(ctx.href('/search', {}, { q: q.trim() || null }));
  };
  return (
    <header className={s.webHeader}>
      <Link to={ctx.href('/')} className={s.logoLink} aria-label="Market-On 지도 홈">
        <img className={`${s.logo} ${s.logoLight}`} src="/brand/logo-light.svg" alt="" />
        <img className={`${s.logo} ${s.logoDark}`} src="/brand/logo-dark.svg" alt="" />
      </Link>
      <nav aria-label="주요 메뉴" className={s.webNav}>
        <Link to={ctx.href('/')} aria-current={section === 'map' ? 'page' : undefined}>
          지도
        </Link>
        <Link to={ctx.href('/shop')} aria-current={section === 'shop' ? 'page' : undefined}>
          장보기
        </Link>
        <Link to={merchantHref} aria-current={section === 'merchant' ? 'page' : undefined}>
          상인·시장
        </Link>
      </nav>
      <form role="search" className={s.webSearch} onSubmit={submit}>
        <Icon name="search" size={20} />
        <label htmlFor="web-q" className="sr-only">
          시장이나 품목 검색
        </label>
        <input
          id="web-q"
          type="search"
          placeholder="시장이나 품목 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <div className={s.webEnd}>
        <NotificationBell />
        <Link to="/me/settings" className={s.webLink}>
          <Icon name="globe" size={18} />
          {LANGUAGE_NAMES[language]}
        </Link>
        {user ? (
          <Link to="/me" className={s.webLogin}>
            내 정보
          </Link>
        ) : (
          <Link to="/login" className={s.webLogin}>
            로그인
          </Link>
        )}
        <Link to={ctx.href('/scan', { store: ctx.storeId })} className={s.webScan}>
          <span>
            <Icon name="camera" size={18} />
            사진으로 확인하기
          </span>
        </Link>
      </div>
    </header>
  );
}

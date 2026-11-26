import { useEffect } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import TabBar from './TabBar';
import WebHeader from './WebHeader';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useSession } from '../../store/session';
import { getMarkets } from '../../api/markets';
import s from './layout.module.css';
import { chromeFor } from './chrome';

/** 주소의 market이 세션과 다르면 세션 시장을 주소에 맞춤(주소가 이김) */
function useUrlMarket() {
  const [params] = useSearchParams();
  const session = useSession();
  const wanted = params.get('market');
  const current = session.market?.market_id;
  useEffect(() => {
    if (!wanted || wanted === current) return;
    let active = true;
    getMarkets()
      .then((markets) => {
        const found = markets.find((m) => m.market_id === wanted && m.status === 'active');
        if (active && found) session.setMarket(found);
      })
      .catch(() => {
        /* 목록을 못 받으면 주소 값만으로 진행 */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, current]);
}

export default function PageLayout() {
  const { pathname } = useLocation();
  const desktop = useIsDesktop();
  const chrome = chromeFor(pathname);
  useUrlMarket();
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [pathname]);
  return (
    <div
      className="app-shell"
      data-tabbar={chrome.tabbar && !desktop ? 'on' : 'off'}
      data-bleed={chrome.bleed ? 'on' : 'off'}
    >
      <a href="#main" className={s.skip}>
        본문으로 건너뛰기
      </a>
      {desktop && <WebHeader />}
      <main id="main" className="app-main">
        <Outlet />
      </main>
      {chrome.tabbar && !desktop && <TabBar />}
    </div>
  );
}

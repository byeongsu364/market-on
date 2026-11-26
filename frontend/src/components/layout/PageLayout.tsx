import { useEffect, useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import TabBar from './TabBar';
import WebHeader from './WebHeader';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useSession } from '../../store/session';
import { getMarkets } from '../../api/markets';
import s from './layout.module.css';
import { chromeFor } from './chrome';
import { showLanding } from './desktopGate';
import Landing from '../../pages/landing/Landing';
import Welcome from '../../pages/welcome/Welcome';
import { markWelcomed, needsWelcome, readWelcomed } from './firstRun';

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
  const [welcomed, setWelcomed] = useState(readWelcomed);
  if (showLanding(pathname, desktop)) return <Landing />;
  // 처음 온 손님: 언어 고르기 → 단계별 안내(한 번만)
  if (needsWelcome(pathname, welcomed))
    return (
      <main id="main" className="app-shell">
        <Welcome
          onDone={() => {
            markWelcomed();
            setWelcomed(true);
          }}
        />
      </main>
    );
  return (
    <div
      className="app-shell"
      data-tabbar={chrome.tabbar && !desktop ? 'on' : 'off'}
      data-bleed={chrome.bleed || (desktop && !chrome.webHeader) ? 'on' : 'off'}
    >
      <a href="#main" className={s.skip}>
        본문으로 건너뛰기
      </a>
      {desktop && chrome.webHeader && <WebHeader />}
      <main id="main" className="app-main">
        <Outlet />
      </main>
      {chrome.tabbar && !desktop && <TabBar />}
    </div>
  );
}

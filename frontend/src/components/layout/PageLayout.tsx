import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';
export default function PageLayout() {
  const { pathname } = useLocation();
  return (
    <div
      className="app"
      data-mode={
        pathname.startsWith('/merchant') ||
        pathname.startsWith('/market-admin') ||
        pathname === '/admin'
          ? 'merchant'
          : undefined
      }
    >
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

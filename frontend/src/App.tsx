import { useT } from './i18n';
import { Route, Routes, Link, Navigate, Outlet } from 'react-router-dom';
import { SessionProvider } from './store/SessionProvider';
import PageLayout from './components/layout/PageLayout';
import Join from './pages/Join';
import Home from './pages/Home';
import Scan from './pages/Scan';
import Result from './pages/Result';
import MarketMap from './pages/MarketMap';
import MarketSelect from './pages/MarketSelect';
import Recommend from './pages/Recommend';
import Chat from './pages/Chat';
import { AuthProvider } from './store/AuthProvider';
import { useAuth } from './hooks/useAuth';
import MerchantStart from './pages/merchant/MerchantStart';
import MerchantLogin from './pages/merchant/MerchantLogin';
import MerchantSignup from './pages/merchant/MerchantSignup';
import SaleNew from './pages/merchant/SaleNew';
import StoreEdit from './pages/merchant/StoreEdit';
import Poster from './pages/merchant/Poster';
import AdminHome from './pages/admin/AdminHome';
import MarketAdmin from './pages/MarketAdmin';
import StorePage from './pages/StorePage';
function MerchantGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.role === 'merchant' && user.status === 'approved' ? (
    <Outlet />
  ) : (
    <Navigate to="/merchant" replace />
  );
}

function MarketAdminGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === 'market_admin' && user.status === 'pending')
    return <p>운영팀이 확인하면 열려요</p>;
  return user?.role === 'market_admin' && user.status === 'approved' ? (
    <Outlet />
  ) : (
    <Navigate to="/merchant" replace />
  );
}

function AppRoutes() {
  const t = useT();
  return (
    <Routes>
      <Route element={<PageLayout />}>
        <Route index element={<Home />} />
        <Route path="scan" element={<Scan />} />
        <Route path="items/:itemId" element={<Result />} />
        <Route path="map" element={<MarketMap />} />
        <Route path="join" element={<Join />} />
        <Route path="markets" element={<MarketSelect />} />
        <Route path="chat" element={<Chat />} />
        <Route path="recommend" element={<Recommend />} />
        <Route path="merchant" element={<MerchantStart />} />
        <Route path="merchant/login" element={<MerchantLogin />} />
        <Route path="merchant/signup" element={<MerchantSignup />} />
        <Route element={<MerchantGuard />}>
          <Route path="merchant/sale/new" element={<SaleNew />} />
          <Route path="merchant/store" element={<StoreEdit />} />
          <Route path="merchant/poster" element={<Poster />} />
        </Route>
        <Route element={<MarketAdminGuard />}>
          <Route path="market-admin" element={<MarketAdmin />} />
          <Route path="market-admin/poster" element={<Poster market />} />
        </Route>
        <Route path="admin" element={<AdminHome />} />
        <Route path="s/:storeId" element={<StorePage />} />
        <Route
          path="*"
          element={
            <>
              <h1>{t('notFound')}</h1>
              <Link to="/">{t('goHome')}</Link>
            </>
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </SessionProvider>
  );
}

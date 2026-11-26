import { RecipePage } from './components/domain/Recipes';
import { useT } from './i18n';
import { Route, Routes, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { SessionProvider } from './store/SessionProvider';
import PageLayout from './components/layout/PageLayout';
import Join from './pages/Join';
import Scan from './pages/scan/Scan';
import Result from './pages/scan/Result';
import MapHome from './pages/map/MapHome';
import Markets from './pages/map/Markets';
import Shop from './pages/shop/Shop';
import Chat from './pages/shop/Chat';
import Search from './pages/map/Search';
import Variety from './pages/scan/Variety';
import ShopRoute from './pages/shop/ShopRoute';
import My from './pages/me/My';
import Saved from './pages/me/Saved';
import Settings from './pages/me/Settings';
import Login from './pages/account/Login';
import Signup from './pages/account/Signup';
import { AuthProvider } from './store/AuthProvider';
import { useAuth } from './hooks/useAuth';
import MerchantStart from './pages/merchant/MerchantStart';
import MerchantSignup from './pages/merchant/MerchantSignup';
import SaleNew from './pages/merchant/SaleNew';
import StoreEdit from './pages/merchant/StoreEdit';
import StorePin from './pages/merchant/StorePin';
import Poster from './pages/merchant/Poster';
import AdminHome from './pages/admin/AdminHome';
import MarketAdmin from './pages/MarketAdmin';
import Store from './pages/map/Store';
import FeaturePage from './pages/landing/FeaturePage';
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

/** 옛 주소를 새 주소로(쿼리 유지) */
function Redirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={to + search} replace />;
}

function AppRoutes() {
  const t = useT();
  return (
    <Routes>
      {/* PC 소개 사이트의 기능별 페이지(앱 틀 밖) */}
      <Route path="intro/:slug" element={<FeaturePage />} />
      <Route element={<PageLayout />}>
        {/* 지도 홈: 시장 밖 / ?market= 시장 안 / ?market=&item= 검색 결과 */}
        <Route index element={<MapHome />} />
        <Route path="search" element={<Search />} />
        <Route path="markets" element={<Markets />} />
        <Route path="s/:storeId" element={<Store />} />
        <Route path="scan" element={<Scan />} />
        <Route path="items/:itemId" element={<Result />} />
        <Route path="items/:itemId/varieties" element={<Variety />} />
        <Route path="recipes/:recipeId" element={<RecipePage />} />
        <Route path="shop" element={<Shop />} />
        <Route path="shop/route" element={<ShopRoute />} />
        <Route path="chat" element={<Chat />} />
        <Route path="me" element={<My />} />
        <Route path="me/saved" element={<Saved />} />
        <Route path="me/settings" element={<Settings />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="signup/merchant" element={<MerchantSignup />} />
        <Route path="join" element={<Join />} />
        <Route path="merchant" element={<MerchantStart />} />
        <Route element={<MerchantGuard />}>
          <Route path="merchant/sale/new" element={<SaleNew />} />
          <Route path="merchant/store" element={<StoreEdit />} />
          <Route path="merchant/store/location" element={<StorePin />} />
          <Route path="merchant/poster" element={<Poster />} />
        </Route>
        <Route element={<MarketAdminGuard />}>
          <Route path="market-admin" element={<MarketAdmin />} />
          <Route path="market-admin/poster" element={<Poster market />} />
        </Route>
        <Route path="admin" element={<AdminHome />} />
        {/* 옛 주소 */}
        <Route path="map" element={<Redirect to="/" />} />
        <Route path="recommend" element={<Redirect to="/shop" />} />
        <Route path="merchant/login" element={<Redirect to="/login" />} />
        <Route path="merchant/signup" element={<Redirect to="/signup/merchant" />} />
        <Route
          path="*"
          element={
            <div className="page">
              <h1>{t('notFound')}</h1>
              <Link to="/" className="text-link">
                {t('goHome')}
              </Link>
            </div>
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

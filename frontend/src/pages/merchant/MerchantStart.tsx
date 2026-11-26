import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../i18n';
import Loading from '../../components/common/Loading';
import Button from '../../components/common/Button';
import AppHeader from '../../components/layout/AppHeader';
import MerchantHome from './MerchantHome';
import Pending from './Pending';
import { LogoutButton } from './parts';
import s from './merchant.module.css';

// /merchant: 로그인 전이면 로그인으로, 승인 대기면 Pending, 승인된 상인이면 상인 홈(Merchant · WebMerchant).
export default function MerchantStart() {
  const auth = useAuth();
  const t = useT();
  const user = auth.user;
  if (auth.loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: '/merchant' }} />;
  if (user.role === 'market_admin' && user.status === 'approved')
    return <Navigate to="/market-admin" replace />;
  if (user.role === 'operator' && user.status === 'approved')
    return <Navigate to="/admin" replace />;
  if (user.role === 'merchant' && user.status === 'approved') return <MerchantHome />;
  if (user.role === 'merchant' && user.status === 'pending') return <Pending />;
  return (
    <>
      <AppHeader back="/me" end={<LogoutButton />} />
      <div className={s.main}>
        <div className={s.heading}>
          <h1 className={s.title}>
            {t(user.status === 'pending' ? 'pendingTitle' : 'unavailableTitle')}
          </h1>
          <p className={s.lead}>{t('pendingHelp')}</p>
        </div>
        <div>
          <Button variant="surface" onClick={() => void auth.logout()}>
            {t('logout')}
          </Button>
        </div>
      </div>
    </>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../i18n';
import MerchantHome from './MerchantHome';
export default function MerchantStart() {
  const auth = useAuth();
  const t = useT();
  if (auth.loading) return <p>{t('loading')}</p>;
  if (auth.user?.role === 'merchant' && auth.user.status === 'approved') return <MerchantHome />;
  if (auth.user)
    return (
      <>
        <h1>
          {t(
            auth.user.role === 'operator'
              ? 'operatorTitle'
              : auth.user.status === 'pending'
                ? 'pendingTitle'
                : 'unavailableTitle',
          )}
        </h1>
        <p>{t('pendingHelp')}</p>
        {auth.user.role === 'operator' && <Link to="/admin">{t('operatorTitle')}</Link>}
        <button className="secondary" onClick={() => void auth.logout()}>
          {t('logout')}
        </button>
      </>
    );
  return (
    <>
      <h1>{t('merchantIntro')}</h1>
      <p>{t('merchantBenefit')}</p>
      <p>{t('merchantEffect')}</p>
      <Link className="button wide" to="/merchant/login">
        {t('login')}
      </Link>
      <Link className="button secondary wide" to="/merchant/signup">
        {t('signup')}
      </Link>
    </>
  );
}

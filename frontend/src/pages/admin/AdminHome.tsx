import Applications from '../../components/domain/Applications';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../hooks/useMerchant';
import AuthForm from '../../components/domain/AuthForm';
import Resource from '../../components/common/Resource';
import ErrorBox from '../../components/common/ErrorBox';
import { useT } from '../../i18n';
function Pending() {
  const f = useAdmin();
  const t = useT();
  return (
    <Resource state={f.pending}>
      {f.pending.data?.map((u) => (
        <article className="card" key={u.id}>
          <h2>{u.login_id}</h2>
          <p>{u.store?.name}</p>
          <time>{new Date(u.created_at).toLocaleString('ko-KR')}</time>
          <div className="chips">
            {(['approve', 'reject'] as const).map((a) => (
              <button
                className="secondary"
                key={a}
                disabled={f.action.loading}
                onClick={() => void f.action.run(u.id, a)}
              >
                {t(a)}
              </button>
            ))}
          </div>
        </article>
      ))}
      {f.pending.data?.length === 0 && <p>{t('noPending')}</p>}
      {f.action.error && <ErrorBox message={f.action.error} />}
    </Resource>
  );
}
export default function AdminHome() {
  const auth = useAuth();
  const t = useT();
  return (
    <>
      <h1>{t('operatorTitle')}</h1>
      {auth.loading ? (
        <p>{t('loading')}</p>
      ) : !auth.user ? (
        <AuthForm operator />
      ) : auth.user.role === 'operator' ? (
        <>
          <Applications />
          <Pending />
          <button className="secondary" onClick={() => void auth.logout()}>
            {t('logout')}
          </button>
        </>
      ) : (
        <p>{t('operatorOnly')}</p>
      )}
    </>
  );
}

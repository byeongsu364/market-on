import { Navigate } from 'react-router-dom';
import Applications from '../../components/domain/Applications';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../hooks/useMerchant';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import Resource from '../../components/common/Resource';
import ErrorBox from '../../components/common/ErrorBox';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import AppHeader from '../../components/layout/AppHeader';
import { useT } from '../../i18n';
import { DataTable, LogoutButton, RoleHeader, Section } from '../merchant/parts';
import { monthDay } from '../merchant/format';
import s from '../merchant/merchant.module.css';

/** 상인 승인(운영자). 시장 관리자가 없는 시장의 상인도 여기서 승인 */
function Pending() {
  const f = useAdmin();
  const t = useT();
  return (
    <Section title={t('operatorTitle')} gap={6}>
      <Resource state={f.pending}>
        <DataTable
          empty={t('noPending')}
          head={[t('adminColId'), t('adminColStore'), t('adminColDate'), '']}
          rows={(f.pending.data ?? []).map((u) => ({
            key: u.id,
            cells: [
              u.login_id,
              u.store?.name ?? '',
              <time key="d" dateTime={u.created_at}>
                {monthDay(u.created_at)}
              </time>,
              <span key="a" className={s.actions}>
                {(['approve', 'reject'] as const).map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={a === 'approve' ? 'primary' : 'surface'}
                    disabled={f.action.loading}
                    aria-label={`${u.login_id} ${t(a)}`}
                    onClick={() => void f.action.run(u.id, a)}
                  >
                    {t(a)}
                  </Button>
                ))}
              </span>,
            ],
          }))}
        />
      </Resource>
      {f.action.error && <ErrorBox message={f.action.error} />}
    </Section>
  );
}

// WebAdmin: 운영자. 시장 입점 신청과 상인 승인(기능은 그대로, 디자인만 새로).
// 시안의 "신청은 없고 요청만 있는 시장", "이용 중인 시장" 표는 운영자용 목록 API가 없어 넣지 않음.
export default function AdminHome() {
  const auth = useAuth();
  const t = useT();
  const desktop = useIsDesktop();
  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to="/login" replace state={{ from: '/admin' }} />;
  const header = desktop ? (
    <RoleHeader role={t('meRoleOperator')} name={t('adminTeam')} />
  ) : (
    <AppHeader back="/me" end={<LogoutButton />} />
  );
  if (auth.user.role !== 'operator')
    return (
      <>
        {header}
        <div className={`${s.web} ${s.narrow}`}>
          <p className={s.lead}>{t('operatorOnly')}</p>
          <div>
            <Button variant="surface" onClick={() => void auth.logout()}>
              {t('logout')}
            </Button>
          </div>
        </div>
      </>
    );
  return (
    <>
      {header}
      <div className={`${s.web} ${s.web40}`}>
        <h1 className={s.webTitle}>{t('adminTitle')}</h1>
        <Applications />
        <Pending />
      </div>
    </>
  );
}

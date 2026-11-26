import * as api from '../../api/marketRequests';
import { useResource, useAction } from '../../hooks/useResource';
import Resource from '../common/Resource';
import Button from '../common/Button';
import ErrorBox from '../common/ErrorBox';
import { people } from '../../utils/people';
import { useT } from '../../i18n';
import { DataTable, Section } from '../../pages/merchant/parts';
import { monthDay } from '../../pages/merchant/format';
import s from '../../pages/merchant/merchant.module.css';

// WebAdmin의 입점 신청 표. 승인·거절 전에 확인을 받음.
export default function Applications() {
  const t = useT();
  const list = useResource(api.applications);
  const action = useAction(async (id: number, decision: 'approve' | 'reject') => {
    if (
      !window.confirm(
        t(decision === 'approve' ? 'adminApproveAppConfirm' : 'adminRejectAppConfirm'),
      )
    )
      return;
    await api.decide(id, decision);
    list.retry();
  });
  return (
    <Section title={t('adminApplications')} gap={6}>
      <Resource state={list}>
        <DataTable
          minWidth={760}
          empty={t('adminNoApplications')}
          head={[
            t('adminColMarket'),
            t('adminColOrg'),
            t('adminColContact'),
            t('adminColRequests'),
            t('adminColNearby'),
            t('adminColDate'),
            '',
          ]}
          rows={(list.data ?? []).map((value) => ({
            key: String(value.id),
            cells: [
              value.demand.name,
              value.manager_org,
              value.contact,
              people(value.demand.requests_7d),
              people(value.demand.nearby_7d),
              <time key="d" dateTime={value.created_at}>
                {monthDay(value.created_at)}
              </time>,
              <span key="a" className={s.actions}>
                {(['approve', 'reject'] as const).map((decision) => (
                  <Button
                    key={decision}
                    size="sm"
                    variant={decision === 'approve' ? 'primary' : 'surface'}
                    disabled={action.loading}
                    aria-label={`${value.demand.name} ${t(decision)}`}
                    onClick={() => void action.run(value.id, decision)}
                  >
                    {t(decision)}
                  </Button>
                ))}
              </span>,
            ],
          }))}
        />
      </Resource>
      <p className={s.help}>{t('adminApplicationsHelp')}</p>
      {action.error && <ErrorBox message={action.error} />}
    </Section>
  );
}

import { useCallback, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useResource, useAction } from '../hooks/useResource';
import { useMarketMap } from '../hooks/useMarketMap';
import { useIsDesktop } from '../hooks/useMediaQuery';
import * as api from '../api/marketAdmin';
import Resource from '../components/common/Resource';
import ErrorBox from '../components/common/ErrorBox';
import Button, { ButtonLink } from '../components/common/Button';
import Icon from '../components/common/Icon';
import { Field } from '../components/common/parts';
import AppHeader from '../components/layout/AppHeader';
import MapView from '../components/map/MapView';
import { useT } from '../i18n';
import { DataTable, LogoutButton, RoleHeader, Section, Stat } from './merchant/parts';
import { fill, monthDay } from './merchant/format';
import s from './merchant/merchant.module.css';

// WebMarketAdmin: 시장 관리자. 상인 승인·거절·정지와 시장 입구 QR(지금 API).
// 시장 지도의 경계·편의시설은 지도 응답에 있을 때만 보여 주고, 공지 편집은 백엔드가 없어 mock만(030 5장).
export default function MarketAdmin() {
  const t = useT();
  const auth = useAuth();
  const desktop = useIsDesktop();
  const market = useResource(api.getMarket);
  const stats = useResource(api.getStats);
  const pending = useResource(useCallback(() => api.getMerchants('pending'), []));
  const approved = useResource(useCallback(() => api.getMerchants('approved'), []));
  const marketId = auth.user?.market?.market_id ?? market.data?.market_id ?? '';
  const map = useMarketMap(marketId);
  const notice = useResource(api.getNotice);
  const [draft, setDraft] = useState<string | null>(null);
  const saveNotice = useAction(async (text: string) => {
    const saved = await api.saveNotice(text);
    notice.retry();
    setDraft(null);
    return saved;
  });
  const action = useAction(async (id: string, decision: 'approve' | 'reject' | 'disable') => {
    if (decision === 'reject' && !window.confirm(t('adminRejectConfirm'))) return false;
    await api.decide(id, decision);
    pending.retry();
    approved.retry();
    market.retry();
    stats.retry();
    return true;
  });
  const name = auth.user?.market?.name ?? market.data?.name ?? '';
  const buttons = (id: string, decisions: readonly ('approve' | 'reject' | 'disable')[]) => (
    <span className={s.actions}>
      {decisions.map((d) => (
        <Button
          key={d}
          size="sm"
          variant={d === 'approve' ? 'primary' : 'surface'}
          disabled={action.loading}
          onClick={() => void action.run(id, d)}
        >
          {d === 'approve' ? t('approve') : d === 'reject' ? t('reject') : t('adminDisable')}
        </Button>
      ))}
    </span>
  );
  const tables = (
    [
      ['adminPendingTitle', pending, ['approve', 'reject'], 'adminColDate'],
      ['adminApprovedTitle', approved, ['disable'], 'adminColJoined'],
    ] as const
  ).map(([title, list, decisions, dateCol]) => (
    <Section key={title} title={t(title)} gap={4}>
      <Resource state={list}>
        <DataTable
          empty={t('adminNoMerchants')}
          head={[t('adminColId'), t('adminColStore'), t(dateCol), '']}
          rows={(list.data ?? []).map((u) => ({
            key: u.id,
            cells: [
              u.login_id,
              u.store.name,
              <time key="d" dateTime={u.created_at}>
                {monthDay(u.created_at)}
              </time>,
              buttons(u.id, decisions),
            ],
          }))}
        />
      </Resource>
    </Section>
  ));
  const boundary = map.data?.boundary;
  const facilities = map.data?.facilities ?? [];
  const aside = (
    <aside className={s.asidePlain} aria-labelledby="ma-map">
      <div className={s.sectionHead}>
        <h2 className={s.h2} id="ma-map">
          {t('adminMapTitle')}
        </h2>
      </div>
      {boundary?.length ? (
        <>
          <div className={s.adminMap}>
            <MapView
              label={fill(t('adminMapLabel'), { market: name })}
              boundary={boundary}
              boundaryLabel={name}
              facilities={facilities}
              sample
            />
          </div>
          <ul className={s.list}>
            <li className={s.linkRow}>
              <Icon name="map" />
              <span>
                <span className={s.linkTitle}>{t('adminBoundary')}</span>
                <span className={s.rowSub}>{t('adminBoundarySub')}</span>
              </span>
            </li>
            <li className={s.linkRow}>
              <Icon name="pin" />
              <span>
                <span className={s.linkTitle}>{t('adminFacilities')}</span>
                <span className={s.rowSub}>
                  {fill(t('adminFacilitiesSub'), { n: facilities.length })}
                </span>
              </span>
            </li>
          </ul>
        </>
      ) : (
        <p className={s.help}>{t('adminNoMap')}</p>
      )}
      {/* 공지와 휴무일: live는 getNotice가 null이라 숨김 */}
      {notice.data !== null && !notice.error && !notice.loading && (
        <form
          className={s.section}
          onSubmit={(e) => {
            e.preventDefault();
            void saveNotice.run(draft ?? notice.data ?? '');
          }}
        >
          <div className={s.linkRow}>
            <Icon name="bell" />
            <span>
              <span className={s.linkTitle}>{t('adminNotice')}</span>
              <span className={s.rowSub}>{notice.data || t('adminNoticeEmpty')}</span>
            </span>
          </div>
          <div className={s.editForm}>
            <Field
              label={t('adminNotice')}
              hideLabel
              maxLength={200}
              value={draft ?? notice.data ?? ''}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" size="md" variant="surface" loading={saveNotice.loading}>
              {t('adminNoticeSave')}
            </Button>
          </div>
          {saveNotice.data !== null && (
            <p role="status" className={s.help}>
              {t('adminNoticeSaved')}
            </p>
          )}
          {saveNotice.error && <ErrorBox message={saveNotice.error} />}
        </form>
      )}
    </aside>
  );
  return (
    <>
      {desktop ? (
        <RoleHeader role={t('meRoleMarketAdmin')} name={name} />
      ) : (
        <AppHeader back="/me" end={<LogoutButton />} />
      )}
      <div className={`${s.web} ${s.web40}`}>
        <div className={s.webTop}>
          <h1 className={s.webTitle}>{fill(t('adminMarketTitle'), { market: name })}</h1>
          <ButtonLink
            to="/market-admin/poster"
            variant="outline"
            size="md"
            icon={<Icon name="qr" />}
          >
            {t('adminMarketPoster')}
          </ButtonLink>
        </div>
        <Resource state={stats}>
          {stats.data && (
            <div className={s.webStats}>
              <Stat
                value={fill(t('adminCountPlaces'), { n: stats.data.stores })}
                label={t('adminStores')}
              />
              <Stat
                value={fill(t('adminCountPeople'), { n: stats.data.merchants_approved })}
                label={t('adminMerchantsApproved')}
              />
              <Stat
                value={fill(t('adminCountPeople'), { n: stats.data.merchants_pending })}
                label={t('adminMerchantsPending')}
              />
              <Stat
                value={fill(t('adminCountTimes'), {
                  n: stats.data.views_week.toLocaleString('ko-KR'),
                })}
                label={t('adminViews')}
              />
            </div>
          )}
        </Resource>
        <div className={s.cols}>
          <div className={`${s.colMain} ${s.gap36}`}>
            {stats.data && (
              <Section title="상인 최근 활동">
                <DataTable
                  head={['아이디', '점포', '최근 세일', '최근 7일 세일']}
                  rows={stats.data.recent.map((r) => ({
                    key: r.user_id,
                    cells: [
                      r.login_id,
                      r.store_name,
                      r.last_sale_at ? monthDay(r.last_sale_at) : '—',
                      r.sales_week,
                    ],
                  }))}
                />
              </Section>
            )}
            {tables}
            {action.error && <ErrorBox message={action.error} />}
          </div>
          {aside}
        </div>
      </div>
    </>
  );
}

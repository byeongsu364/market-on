import { useAuth } from '../../hooks/useAuth';
import { useMarkets } from '../../hooks/useMarkets';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import Icon, { type IconName } from '../../components/common/Icon';
import { ButtonLink } from '../../components/common/Button';
import AppHeader from '../../components/layout/AppHeader';
import { Footer, LogoutButton, Progress, RoleHeader } from './parts';
import { fill } from './format';
import s from './merchant.module.css';

// Pending: 상인 가입 3단계 중 마지막. 시장 관리자가 승인하기 전까지 보여 줌.
export default function Pending() {
  const t = useT();
  const { user } = useAuth();
  const markets = useMarkets();
  const desktop = useIsDesktop();
  const market = markets.data?.find((m) => m.market_id === user?.store?.market_id)?.name;
  const after: { icon: IconName; title: string; sub?: string }[] = [
    { icon: 'tag', title: t('postSale'), sub: t('merchantAfterSaleSub') },
    { icon: 'check', title: t('merchantAfterPrices') },
    { icon: 'eye', title: t('merchantAfterViews') },
  ];
  const body = (
    <>
      <div className={`${s.heading} ${s.gap16}`}>
        <Progress step={3} />
        <div className={s.heading}>
          <h1 className={s.title}>{t('merchantPendingTitle')}</h1>
          <p className={s.lead}>
            {market ? fill(t('merchantPendingLead'), { market }) : t('merchantPendingLeadNoMarket')}
          </p>
        </div>
      </div>
      <dl className={s.list}>
        {market && (
          <div className={s.infoRow}>
            <dt>{t('merchantMarket')}</dt>
            <dd>{market}</dd>
          </div>
        )}
        <div className={s.infoRow}>
          <dt>{t('merchantStore')}</dt>
          <dd>{user?.store?.name}</dd>
        </div>
      </dl>
      <section className={`${s.section} ${s.gap4}`}>
        <h2 className={s.h2}>{t('merchantAfterTitle')}</h2>
        <ul className={s.list}>
          {after.map((a) => (
            <li key={a.title} className={s.linkRow}>
              <Icon name={a.icon} />
              <span>
                <span className={s.linkTitle}>{a.title}</span>
                {a.sub && <span className={s.rowSub}>{a.sub}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
  if (desktop)
    return (
      <>
        <RoleHeader role={t('meRoleMerchant')} name={user?.store?.name} />
        <div className={`${s.web} ${s.narrow}`}>
          {body}
          <div>
            <ButtonLink to="/" variant="primary">
              {t('merchantContinueGuest')}
            </ButtonLink>
          </div>
        </div>
      </>
    );
  return (
    <>
      <AppHeader back="/me" end={<LogoutButton />} />
      <div className={`${s.main} ${s.gap24} ${s.withFooter}`}>{body}</div>
      <Footer>
        <ButtonLink to="/" variant="primary" grow>
          {t('merchantContinueGuest')}
        </ButtonLink>
      </Footer>
    </>
  );
}

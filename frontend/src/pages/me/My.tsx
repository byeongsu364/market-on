import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSession } from '../../store/session';
import { ButtonLink } from '../../components/common/Button';
import Button from '../../components/common/Button';
import Icon, { type IconName } from '../../components/common/Icon';
import Sheet from '../../components/common/Sheet';
import AppHeader from '../../components/layout/AppHeader';
import { LANGUAGE_NAMES } from './languages';
import { useT } from '../../i18n';
import type { User } from '../../types/contract';
import s from './me.module.css';

type InstallPrompt = Event & { prompt: () => Promise<void> };

function Row({
  icon,
  title,
  end,
  to,
  onClick,
}: {
  icon: IconName;
  title: string;
  end?: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={s.rowIcon}>
        <Icon name={icon} size={22} />
      </span>
      <span className={s.rowTitle}>{title}</span>
      <span className={s.rowEnd}>
        {end}
        <Icon name="chevronRight" size={20} color="var(--color-muted)" />
      </span>
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={s.row}>
          {body}
        </Link>
      ) : (
        <button type="button" className={s.row} onClick={onClick}>
          {body}
        </button>
      )}
    </li>
  );
}

function roleLabel(user: User, t: ReturnType<typeof useT>) {
  const role = {
    customer: t('meRoleCustomer'),
    merchant: t('meRoleMerchant'),
    market_admin: t('meRoleMarketAdmin'),
    operator: t('meRoleOperator'),
  }[user.role];
  const where = user.store?.name ?? user.market?.name;
  return [role, where, user.status === 'pending' ? t('meStatusPending') : '']
    .filter(Boolean)
    .join(', ');
}

// My: 손님은 로그인 없이도 모든 기능. 상인 화면은 여기서(PC는 머리말의 "상인·시장") 들어감.
export default function My() {
  const t = useT();
  const { user, logout } = useAuth();
  const { language } = useSession();
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', keep);
    return () => window.removeEventListener('beforeinstallprompt', keep);
  }, []);
  const merchantRows =
    user?.role === 'merchant' ? (
      <Row icon="store" title={t('meMerchantHome')} to="/merchant" />
    ) : user?.role === 'market_admin' ? (
      <Row icon="store" title={t('meMarketAdminHome')} to="/market-admin" />
    ) : user?.role === 'operator' ? (
      <Row icon="store" title={t('meAdminHome')} to="/admin" />
    ) : (
      <>
        <Row icon="store" title={t('meStartMerchant')} to="/signup/merchant" />
        <Row icon="plus" title={t('meJoinMarket')} to="/join" />
      </>
    );
  return (
    <>
      <AppHeader back="/" />
      <div className={s.main}>
        <h1 className={s.title}>{t('meTitle')}</h1>
        {user ? (
          <div className={s.box}>
            <div className={s.boxText}>
              <span className={s.boxTitle}>{user.login_id}</span>
              <span className={s.boxSub}>{roleLabel(user, t)}</span>
            </div>
            <Button size="md" variant="outline" className={s.logout} onClick={() => void logout()}>
              {t('logout')}
            </Button>
          </div>
        ) : (
          <div className={s.box}>
            <div className={s.boxText}>
              <span className={s.boxTitle}>{t('meGuestTitle')}</span>
              <span className={s.boxSub}>{t('meGuestBody')}</span>
            </div>
            <div className={s.boxActions}>
              <ButtonLink to="/login" variant="primary" size="md" grow>
                {t('login')}
              </ButtonLink>
              <ButtonLink to="/signup" variant="surface" size="md" grow className={s.white}>
                {t('meSignupTitle')}
              </ButtonLink>
            </div>
          </div>
        )}
        <ul className={s.rows}>
          <Row icon="tag" title={t('meSaved')} to="/me/saved" />
          <Row
            icon="globe"
            title={t('meSettings')}
            end={LANGUAGE_NAMES[language]}
            to="/me/settings"
          />
          <Row
            icon="download"
            title={t('meInstall')}
            end={t('meInstallSub')}
            onClick={() =>
              install ? void install.prompt().then(() => setInstall(null)) : setHelp(true)
            }
          />
        </ul>
        <section className={s.section} aria-labelledby="me-merchant">
          <span className={s.sectionLabel} id="me-merchant">
            {t('meMerchantSection')}
          </span>
          <ul className={s.rows}>{merchantRows}</ul>
        </section>
        <p className={s.sources}>{t('meSources')}</p>
      </div>
      {help && (
        <Sheet title={t('meInstall')} onClose={() => setHelp(false)}>
          <p>{t('meInstallHelp')}</p>
        </Sheet>
      )}
    </>
  );
}

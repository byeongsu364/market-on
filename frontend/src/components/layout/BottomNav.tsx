import { NavLink } from 'react-router-dom';
import { useT } from '../../i18n';
export default function BottomNav() {
  const t = useT();
  return (
    <nav className="bottom-nav" aria-label={t('mainNavigation')}>
      {(['home', 'map', 'recommend', 'merchant'] as const).map((key, i) => (
        <NavLink key={key} to={['/', '/map', '/recommend', '/merchant'][i]} end={i === 0}>
          {t(key)}
        </NavLink>
      ))}
    </nav>
  );
}

import { Link } from 'react-router-dom';
import { useSession } from '../../store/session';
import { useT } from '../../i18n';
export default function Header() {
  const s = useSession();
  const t = useT();
  return (
    <header>
      <Link to="/" aria-label={t('homeLabel')}>
        <img className="logo logo-light" src="/brand/logo-light.svg" alt="Market-On" />
        <img className="logo logo-dark" src="/brand/logo-dark.svg" alt="Market-On" />
      </Link>
      <div className="settings">
        <label>
          <span className="sr-only">{t('theme')}</span>
          <select
            aria-label={t('theme')}
            value={s.theme}
            onChange={(e) => s.setTheme(e.target.value as typeof s.theme)}
          >
            {(['system', 'light', 'dark'] as const).map((v) => (
              <option key={v} value={v}>
                {t(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{t('language')}</span>
          <select
            aria-label={t('language')}
            value={s.language}
            onChange={(e) => s.setLanguage(e.target.value as typeof s.language)}
          >
            {['ko', 'en', 'zh', 'ja', 'vi'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}

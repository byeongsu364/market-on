import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import s from './account.module.css';

// PC 로그인·회원가입 왼쪽 면: 로고의 차양을 크게(브랜드를 크게 보여 줄 자리에 한 번)
export default function AuthHero() {
  const t = useT();
  return (
    <div className={s.hero}>
      <div className={s.awning} aria-hidden="true">
        <span className={s.awningBar} />
        <span className={s.awningCells}>
          <span />
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className={s.heroBody}>
        <Link to="/" aria-label="Market-On 지도 홈">
          <img className={s.heroLogo} src="/brand/logo-dark.svg" alt="" />
        </Link>
        <div className={s.heroText}>
          <p className={s.heroTitle}>{t('meHeroTitle')}</p>
          <p className={s.heroLead}>{t('meHeroBody')}</p>
        </div>
      </div>
    </div>
  );
}

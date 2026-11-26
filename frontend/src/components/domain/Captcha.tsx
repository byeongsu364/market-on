import type { useCaptcha } from '../../hooks/useCaptcha';
import Icon from '../common/Icon';
import { useT } from '../../i18n';
import s from '../../pages/account/account.module.css';

export default function Captcha({
  captcha,
  id = 'captcha',
}: {
  captcha: ReturnType<typeof useCaptcha>;
  id?: string;
}) {
  const t = useT();
  if (!captcha.data) return null;
  return (
    <div className={s.group}>
      <label htmlFor={id} className={s.groupLabel} style={{ color: 'var(--color-ink)' }}>
        {t('meCaptcha')}
      </label>
      <div className={s.captchaRow}>
        <img className={s.captchaImage} src={captcha.data.image} alt={t('meCaptchaImage')} />
        <button
          type="button"
          className="text-link"
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
          }}
          aria-label={t('meCaptchaRefresh')}
          onClick={captcha.refresh}
        >
          <Icon name="refresh" />
        </button>
        <input
          id={id}
          className={s.captchaInput}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={10}
          placeholder={t('meCaptchaPlaceholder')}
          value={captcha.answer}
          onChange={(e) => captcha.setAnswer(e.target.value.replace(/\D/g, ''))}
        />
      </div>
    </div>
  );
}

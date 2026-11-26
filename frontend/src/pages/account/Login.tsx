import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAction } from '../../hooks/useResource';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import Button, { ButtonLink } from '../../components/common/Button';
import { Field } from '../../components/common/parts';
import ErrorBox from '../../components/common/ErrorBox';
import AppHeader from '../../components/layout/AppHeader';
import Captcha from '../../components/domain/Captcha';
import { useCaptcha } from '../../hooks/useCaptcha';
import AuthHero from './AuthHero';
import { useT } from '../../i18n';
import { homeFor } from './homeFor';
import s from './account.module.css';

// Login · WebLogin. 로그인 후 이전 화면 또는 역할에 맞는 홈으로 이동해요.
export default function Login() {
  const t = useT();
  const auth = useAuth();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [params] = useSearchParams();
  const next = params.get('next');
  const signupHref = `/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const captcha = useCaptcha();
  // 서버가 캡차를 요구할 때만(2번 넘게 틀린 뒤) 보여 줌
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const action = useAction(async () => {
    try {
      const user = await auth.login({
        login_id: id.trim().toLowerCase(),
        password,
        ...(needCaptcha ? captcha.fields : {}),
      });
      navigate((next?.startsWith('/') && !next.startsWith('//') ? next : from) ?? homeFor(user), {
        replace: true,
      });
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'CAPTCHA_REQUIRED' || code === 'CAPTCHA_INVALID') {
        setNeedCaptcha(true);
        captcha.refresh();
      }
      throw e;
    }
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run();
  };
  const form = (
    <form className={s.fields} onSubmit={submit} style={{ gap: 24 }}>
      <div className={s.fields}>
        <Field
          label={t('loginId')}
          placeholder={t('loginId')}
          autoComplete="username"
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
          style={{ height: 54 }}
        />
        <Field
          label={t('password')}
          placeholder={t('password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ height: 54 }}
        />
        {needCaptcha && <Captcha captcha={captcha} id="login-captcha" />}
      </div>
      {action.error && <ErrorBox message={action.error} />}
      <div className={s.actions}>
        <Button type="submit" variant="primary" wide loading={action.loading}>
          {t('login')}
        </Button>
        {!desktop && (
          <ButtonLink to={signupHref} variant="surface" wide>
            {t('meSignupTitle')}
          </ButtonLink>
        )}
      </div>
      <div className={s.browse}>
        <Link to="/">{t('meBrowse')}</Link>
      </div>
    </form>
  );
  if (desktop)
    return (
      <div className={s.web}>
        <AuthHero />
        <div className={s.panel}>
          <div className={s.panelInner}>
            <nav className={s.seg} aria-label="로그인과 회원가입">
              <Link to="/login" aria-current="page">
                {t('login')}
              </Link>
              <Link to={signupHref}>{t('meSignupTitle')}</Link>
            </nav>
            <div className={s.heading}>
              <h1 className={s.webTitle}>{t('login')}</h1>
              <p className={s.lead}>{t('meLoginLead')}</p>
            </div>
            {form}
          </div>
        </div>
      </div>
    );
  return (
    <>
      <AppHeader back="/me" />
      <div className={s.main}>
        <div className={s.intro}>
          <img className={s.mark} src="/brand/mark-tight.svg" alt="Market-On" />
          <div className={s.heading}>
            <h1 className={s.title}>{t('login')}</h1>
            <p className={s.lead}>{t('meLoginLead')}</p>
          </div>
        </div>
        {form}
      </div>
    </>
  );
}

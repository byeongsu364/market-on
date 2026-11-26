import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAction } from '../../hooks/useResource';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { isMock } from '../../api/client';
import Button, { ButtonLink } from '../../components/common/Button';
import { Field } from '../../components/common/parts';
import ErrorBox from '../../components/common/ErrorBox';
import AppHeader from '../../components/layout/AppHeader';
import Captcha from '../../components/domain/Captcha';
import { useCaptcha } from '../../hooks/useCaptcha';
import AuthHero from './AuthHero';
import { useT } from '../../i18n';
import s from './account.module.css';

type Role = 'customer' | 'merchant' | 'market_admin';

// Signup · WebSignup. 손님 계정은 백엔드에 역할이 아직 없어 mock에서만(030 5장).
// 상인은 내 점포 고르기(/signup/merchant), 시장 관리자는 시장 입점 신청(/join)으로 이어짐.
export default function Signup() {
  const t = useT();
  const auth = useAuth();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const roles: Role[] = isMock
    ? ['customer', 'merchant', 'market_admin']
    : ['merchant', 'market_admin'];
  const [role, setRole] = useState<Role>(roles[0]);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState('');
  const captcha = useCaptcha();
  const action = useAction(async () => {
    await auth.signupCustomer({
      login_id: id.trim().toLowerCase(),
      password,
      ...captcha.fields,
    });
    navigate('/me', { replace: true });
    return true;
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (role === 'merchant') return navigate('/signup/merchant');
    if (role === 'market_admin') return navigate('/join');
    if (password !== confirm) return setProblem(t('mePwMismatch'));
    if (!agreed) return setProblem(t('meTermsRequired'));
    setProblem('');
    void action.run().catch(() => captcha.refresh());
  };
  const label: Record<Role, string> = {
    customer: t('meRoleCustomer'),
    merchant: t('meRoleMerchant'),
    market_admin: t('meRoleMarketAdmin'),
  };
  const submitText = role === 'customer' ? t('signup') : t('meNext');
  const body = (
    <>
      <div className={s.group}>
        <span className={s.groupLabel} id="signup-role">
          {t('meSignupRole')}
        </span>
        <div className={s.seg} role="radiogroup" aria-labelledby="signup-role">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
            >
              {label[r]}
            </button>
          ))}
        </div>
      </div>
      {role === 'customer' ? (
        <>
          <div className={s.fields}>
            <Field
              label={t('loginId')}
              placeholder={t('meIdPlaceholder')}
              autoComplete="username"
              required
              minLength={4}
              maxLength={20}
              pattern="[a-z0-9_]+"
              value={id}
              onChange={(e) => setId(e.target.value)}
              style={{ height: 54 }}
            />
            <Field
              label={t('password')}
              placeholder={t('mePwPlaceholder')}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ height: 54 }}
            />
            <Field
              label={t('mePwConfirm')}
              placeholder={t('mePwConfirmPlaceholder')}
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={confirm && confirm !== password ? t('mePwMismatch') : undefined}
              style={{ height: 54 }}
            />
          </div>
          <Captcha captcha={captcha} id="signup-captcha" />
          <label className={s.check}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>{t('meTerms')}</span>
          </label>
        </>
      ) : (
        <p className={s.note}>
          {role === 'merchant' ? t('meMerchantNext') : t('meMarketAdminNext')}
        </p>
      )}
      {!isMock && role !== 'customer' && <p className="caption">{t('meCustomerLiveHidden')}</p>}
      {(problem || action.error) && <ErrorBox message={problem || action.error} />}
    </>
  );
  if (desktop)
    return (
      <div className={s.web} style={{ minHeight: 900 }}>
        <AuthHero />
        <div className={s.panel}>
          <form
            className={`${s.panelInner} ${s.panelInnerSignup}`}
            onSubmit={submit}
            noValidate={role !== 'customer'}
          >
            <nav className={s.seg} aria-label="로그인과 회원가입">
              <Link to="/login">{t('login')}</Link>
              <Link to="/signup" aria-current="page">
                {t('meSignupTitle')}
              </Link>
            </nav>
            <h1 className={s.webTitle}>{t('meSignupTitle')}</h1>
            {body}
            <Button type="submit" variant="primary" wide loading={action.loading}>
              {submitText}
            </Button>
          </form>
        </div>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate={role !== 'customer'}>
      <AppHeader title={t('meSignupTitle')} back="/login" />
      <div className={`${s.main} ${s.mainSignup}`}>{body}</div>
      <div className={s.footer}>
        <div className={s.footerInner}>
          {role === 'customer' ? (
            <Button type="submit" variant="primary" wide loading={action.loading}>
              {submitText}
            </Button>
          ) : (
            <ButtonLink
              to={role === 'merchant' ? '/signup/merchant' : '/join'}
              variant="primary"
              wide
            >
              {submitText}
            </ButtonLink>
          )}
        </div>
      </div>
    </form>
  );
}

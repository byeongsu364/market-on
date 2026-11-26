import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAction } from '../../hooks/useResource';
import Button from '../common/Button';
import ErrorBox from '../common/ErrorBox';
import { useT } from '../../i18n';
export default function AuthForm({
  storeId,
  customer = false,
}: {
  storeId?: string;
  operator?: boolean;
  customer?: boolean;
}) {
  const [params] = useSearchParams();
  const next = params.get('next');
  const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
  const [confirmation, setConfirmation] = useState('');
  const t = useT();
  const auth = useAuth();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const action = useAction(async () => {
    const q = { login_id: id, password, store_id: storeId };
    if (customer) {
      if (password !== confirmation) throw new Error('비밀번호가 일치하지 않아요.');
      await auth.signup({ login_id: id, password, role: 'customer' });
      navigate(destination);
    } else if (storeId) {
      await auth.signup(q);
      navigate('/merchant');
    } else {
      const user = await auth.login(q);
      navigate(
        user.role === 'customer'
          ? destination
          : user.role === 'operator'
            ? '/admin'
            : user.role === 'market_admin'
              ? '/market-admin'
              : '/merchant',
      );
    }
    return true;
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void action.run();
      }}
    >
      <label>
        {t('loginId')}
        <input
          required
          minLength={4}
          maxLength={20}
          pattern="[a-z0-9_]+"
          autoComplete="username"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
      </label>
      <label>
        {t('password')}
        <input
          required
          minLength={8}
          type={visible ? 'text' : 'password'}
          autoComplete={storeId || customer ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {customer && (
        <label>
          비밀번호 확인
          <input
            required
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
      )}
      <button
        type="button"
        className="secondary"
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {t('showPassword')}
      </button>
      <Button className="wide" type="submit" loading={action.loading}>
        {t(storeId || customer ? 'signup' : 'login')}
      </Button>
      {action.error && <ErrorBox message={action.error} />}
    </form>
  );
}

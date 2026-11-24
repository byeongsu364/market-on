import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAction } from '../../hooks/useResource';
import Button from '../common/Button';
import ErrorBox from '../common/ErrorBox';
import { useT } from '../../i18n';
export default function AuthForm({
  storeId,
  operator = false,
}: {
  storeId?: string;
  operator?: boolean;
}) {
  const t = useT();
  const auth = useAuth();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const action = useAction(async () => {
    const q = { login_id: id, password, store_id: storeId };
    if (storeId) await auth.signup(q);
    else await auth.login(q);
    navigate(operator ? '/admin' : '/merchant');
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
          autoComplete={storeId ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary"
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {t('showPassword')}
      </button>
      <Button className="wide" type="submit" loading={action.loading}>
        {t(storeId ? 'signup' : 'login')}
      </Button>
      {action.error && <ErrorBox message={action.error} />}
    </form>
  );
}

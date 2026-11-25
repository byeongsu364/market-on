import { Link } from 'react-router-dom';
import AuthForm from '../../components/domain/AuthForm';
import { useT } from '../../i18n';
export default function MerchantLogin() {
  const t = useT();
  return (
    <>
      <h1>{t('login')}</h1>
      <AuthForm />
      <Link to="/join">시장 입점 신청</Link>
    </>
  );
}

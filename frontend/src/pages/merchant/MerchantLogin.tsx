import { Link, useSearchParams } from 'react-router-dom';
import AuthForm from '../../components/domain/AuthForm';
import { useT } from '../../i18n';
export default function MerchantLogin() {
  const [params] = useSearchParams();
  const t = useT();
  return (
    <>
      <h1>{t('login')}</h1>
      <AuthForm />
      <Link to={`/signup?${params}`}>회원가입</Link>
      <Link to="/">로그인 없이 둘러보기</Link>
      <Link to="/join">시장 입점 신청</Link>
    </>
  );
}

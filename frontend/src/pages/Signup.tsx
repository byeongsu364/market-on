import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import AuthForm from '../components/domain/AuthForm';
export default function Signup() {
  const [customer, setCustomer] = useState(true);
  const [params] = useSearchParams();
  return (
    <>
      <h1>회원가입</h1>
      <div role="group" aria-label="가입 유형">
        <button aria-pressed={customer} onClick={() => setCustomer(true)}>
          손님
        </button>
        <Link to={`/merchant/signup?${params}`}>상인</Link>
      </div>
      {customer && <AuthForm customer />}
    </>
  );
}

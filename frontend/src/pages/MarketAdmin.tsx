import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useResource, useAction } from '../hooks/useResource';
import * as api from '../api/marketAdmin';
import Resource from '../components/common/Resource';
import ErrorBox from '../components/common/ErrorBox';
export default function MarketAdmin() {
  const auth = useAuth();
  const market = useResource(api.getMarket);
  const pending = useResource(useCallback(() => api.getMerchants('pending'), []));
  const approved = useResource(useCallback(() => api.getMerchants('approved'), []));
  const action = useAction(async (id: string, decision: 'approve' | 'reject' | 'disable') => {
    if (decision === 'reject' && !window.confirm('이 상인의 가입을 거절할까요?')) return false;
    await api.decide(id, decision);
    pending.retry();
    approved.retry();
    market.retry();
    return true;
  });
  return (
    <>
      <h1>{auth.user?.market?.name}</h1>
      <Resource state={market}>
        {market.data && (
          <div className="merchant-stats market-admin-stats">
            <p className="card">
              점포 수<strong className="big-number">{market.data.stores_total}</strong>
            </p>
            <p className="card">
              가입 상인<strong className="big-number">{market.data.merchants_approved}</strong>
            </p>
            <p className="card">
              이번 주 점포 조회 수<strong className="big-number">{market.data.views_7d}</strong>
            </p>
          </div>
        )}
      </Resource>
      {(
        [
          ['승인 대기 상인', pending, ['approve', 'reject']],
          ['승인된 상인', approved, ['disable']],
        ] as const
      ).map(([title, list, decisions]) => (
        <section key={title}>
          <h2>{title}</h2>
          <Resource state={list}>
            {list.data?.length === 0 && <p>상인이 없어요</p>}
            {list.data?.map((user) => (
              <article className="card" key={user.id}>
                <h3>{user.store.name}</h3>
                <p>{user.login_id}</p>
                <time dateTime={user.created_at}>
                  {new Date(user.created_at).toLocaleString('ko-KR')}
                </time>
                <div className="merchant-links">
                  {decisions.map((decision) => (
                    <button
                      className="secondary"
                      key={decision}
                      disabled={action.loading}
                      onClick={() => void action.run(user.id, decision)}
                    >
                      {decision === 'approve' ? '승인' : decision === 'reject' ? '거절' : '정지'}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </Resource>
        </section>
      ))}
      {action.error && <ErrorBox message={action.error} />}
      <Link to="/market-admin/poster">시장 입구 QR 포스터</Link>
      <button className="secondary market-admin-logout" onClick={() => void auth.logout()}>
        로그아웃
      </button>
    </>
  );
}

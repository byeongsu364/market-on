import * as api from '../../api/marketRequests';
import { useResource, useAction } from '../../hooks/useResource';
import Resource from '../common/Resource';
import { people } from '../../utils/people';
export default function Applications() {
  const list = useResource(api.applications);
  const action = useAction(async (id: number, decision: 'approve' | 'reject') => {
    if (
      !window.confirm(
        decision === 'approve' ? '이 시장의 입점을 승인할까요?' : '이 시장의 입점을 거절할까요?',
      )
    )
      return;
    await api.decide(id, decision);
    list.retry();
  });
  return (
    <section>
      <h2>입점 신청</h2>
      <Resource state={list}>
        {list.data?.length === 0 && <p>확인할 신청이 없어요</p>}
        {list.data?.map((value) => (
          <article className="card" key={value.id}>
            <h3>{value.demand.name}</h3>
            <p>
              {value.manager_org} · {value.contact}
            </p>
            <time>{new Date(value.created_at).toLocaleString('ko-KR')}</time>
            <p>
              이번 주 근처에서 연 사람 {people(value.demand.nearby_7d)} · 요청한 사람{' '}
              {people(value.demand.requests_7d)}
            </p>
            <div className="chips">
              {(['approve', 'reject'] as const).map((decision) => (
                <button
                  key={decision}
                  disabled={action.loading}
                  onClick={() => void action.run(value.id, decision)}
                >
                  {decision === 'approve' ? '승인' : '거절'}
                </button>
              ))}
            </div>
          </article>
        ))}
      </Resource>
      {action.error && <p role="alert">{action.error}</p>}
    </section>
  );
}

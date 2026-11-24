import { useAction } from '../../hooks/useResource';
import { requestMarket } from '../../api/marketRequests';
import type { Market } from '../../types/contract';
import { people } from '../../utils/people';
export default function MarketRequest({
  market,
  compact = false,
}: {
  market: Market;
  compact?: boolean;
}) {
  const action = useAction(() => requestMarket(market.market_id));
  return (
    <article className="card">
      <h2>{market.name}</h2>
      <p>이 시장은 아직 Market-On에 없어요</p>
      <button disabled={action.loading || !!action.data} onClick={() => void action.run()}>
        {compact ? '쓰고 싶어요' : '이 시장도 쓰고 싶어요'}
      </button>
      {action.data && (
        <p role="status">요청했어요 · 이번 주 {people(action.data.requests_7d)}이 요청했어요</p>
      )}
      {action.data && <small>최근 7일 · 익명 기기 기준</small>}
      {action.error && <p role="alert">{action.error}</p>}
    </article>
  );
}

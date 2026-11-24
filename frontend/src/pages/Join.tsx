import { useState, useCallback } from 'react';
import * as api from '../api/marketRequests';
import { useResource, useAction } from '../hooks/useResource';
import Resource from '../components/common/Resource';
import { people } from '../utils/people';
import type { Market, JoinRequest } from '../types/contract';
function Application({ market }: { market: Market }) {
  const demand = useResource(
    useCallback(() => api.getDemand(market.market_id), [market.market_id]),
  );
  const action = useAction(api.join);
  const [org, setOrg] = useState<JoinRequest['manager_org']>('상인회');
  if (action.data)
    return (
      <p role="status">
        운영팀이 확인하면 시장 관리자 화면이 열려요. 그다음 상인 가입은 시장 관리자가 승인해요
      </p>
    );
  return (
    <>
      <h2>{market.name}</h2>
      <Resource state={demand}>
        {demand.data && (
          <article className="card">
            <p>이번 주 이 시장 근처에서 Market-On을 연 사람 {people(demand.data.nearby_7d)}</p>
            <p>이 시장을 요청한 사람 {people(demand.data.requests_7d)}</p>
            <small>최근 7일 · 익명 기기 기준</small>
          </article>
        )}
      </Resource>
      {market.status === 'active' ? (
        <p>이미 이용할 수 있는 시장이에요</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void action.run({
              market_id: market.market_id,
              manager_org: org,
              contact: String(data.get('contact')),
              login_id: String(data.get('login_id')),
              password: String(data.get('password')),
              ...(data.get('store_count') ? { store_count: Number(data.get('store_count')) } : {}),
              ...(data.get('note') ? { note: String(data.get('note')) } : {}),
            });
          }}
        >
          <fieldset>
            <legend>관리 주체</legend>
            <div className="chips">
              {(['상인회', '관리사무소', '기타'] as const).map((value) => (
                <button
                  type="button"
                  className="chip"
                  key={value}
                  aria-pressed={org === value}
                  onClick={() => setOrg(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            시장 공식 연락처
            <input name="contact" required maxLength={80} />
          </label>
          <p className="caption">개인 휴대폰 말고 시장 사무실·상인회 대표 번호</p>
          <label>
            점포 수 (선택)
            <input name="store_count" type="number" min="0" max="2147483647" />
          </label>
          <label>
            아이디
            <input name="login_id" required pattern="[A-Za-z0-9_]{4,20}" autoComplete="username" />
          </label>
          <label>
            비밀번호
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label>
            메모 (선택)
            <textarea name="note" maxLength={200} rows={3} style={{ width: '100%' }} />
          </label>
          <button disabled={action.loading}>입점 신청</button>
          {action.error && <p role="alert">{action.error}</p>}
        </form>
      )}
    </>
  );
}
export default function Join() {
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<Market | null>(null);
  const search = useAction(api.searchMarkets);
  return (
    <>
      <h1>시장 입점 신청</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search.run(query);
        }}
      >
        <label>
          시장 이름
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button disabled={search.loading}>검색</button>
      </form>
      {search.error && <p role="alert">{search.error}</p>}
      {search.data?.length === 0 && <p>시장을 찾지 못했어요</p>}
      {search.data?.map((value) => (
        <button className="market-option" key={value.market_id} onClick={() => setMarket(value)}>
          {value.name}
        </button>
      ))}
      {market && <Application key={market.market_id} market={market} />}
    </>
  );
}

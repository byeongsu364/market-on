import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../store/session';
import { useRequireMarket } from '../hooks/useFlows';
import { useChat } from '../hooks/useChat';
import ModelLabel from '../components/domain/ModelLabel';
import ErrorBox from '../components/common/ErrorBox';
const examples = ['대파 냉동해도 돼요?', '4명 선물 3만원으로 구성해 줘', '사과 어디서 팔아요?'];
function Conversation({ marketId, itemId }: { marketId: string; itemId?: string }) {
  const f = useChat(marketId, itemId);
  return (
    <>
      <h1>물어보기</h1>
      <button disabled={f.loading} onClick={f.reset}>
        새 대화
      </button>
      {!f.entries.length && (
        <div className="chips">
          {examples.map((q) => (
            <button className="chip" key={q} disabled={f.loading} onClick={() => void f.send(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      <div className="chat-messages" aria-live="polite">
        {f.entries.map((e, i) => (
          <article
            key={i}
            className={`card chat-bubble chat-${e.role}`}
            aria-label={e.role === 'user' ? '내 질문' : '답변'}
          >
            <p>{e.content}</p>
            {e.response && (
              <>
                <div className="chips">
                  {e.response.tools.map((tool) => (
                    <small key={tool.name} className="chat-tool">
                      {tool.label}
                    </small>
                  ))}
                </div>
                {!!e.response.citations.length && (
                  <>
                    <h2>출처</h2>
                    <ul>
                      {e.response.citations.map((s, j) => (
                        <li key={j}>
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer">
                              {s.title}
                            </a>
                          ) : (
                            s.title
                          )}
                          {s.publisher && ` · ${s.publisher}`}
                          {s.draft && <small> · 검수 전</small>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <ModelLabel model={e.response.model} />
                {e.response.items.map((item) => (
                  <p key={item.item_id}>
                    <Link to={`/items/${encodeURIComponent(item.item_id)}`}>
                      {item.name} 결과 보기
                    </Link>{' '}
                    · <Link to={`/map?item=${encodeURIComponent(item.item_id)}`}>지도 보기</Link>
                  </p>
                ))}
              </>
            )}
          </article>
        ))}
      </div>
      {f.loading && <p role="status">확인하고 있어요</p>}
      {f.error && <ErrorBox message={f.error} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void f.send();
        }}
      >
        <label>
          궁금한 점
          <input
            maxLength={500}
            value={f.input}
            disabled={f.loading}
            onChange={(e) => f.setInput(e.target.value)}
          />
        </label>
        <small>{f.input.length}/500</small>
        <button type="submit" disabled={f.loading || !f.input.trim()}>
          보내기
        </button>
      </form>
    </>
  );
}
export default function Chat() {
  const ready = useRequireMarket();
  const { market } = useSession();
  const [params] = useSearchParams();
  const itemId = params.get('item_id') ?? undefined;
  if (!ready || !market) return null;
  return (
    <Conversation
      key={`${market.market_id}:${itemId ?? ''}`}
      marketId={market.market_id}
      itemId={itemId}
    />
  );
}

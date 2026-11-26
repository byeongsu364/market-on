import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import * as api from '../../api/reviews';
import type { StoreReviews as Reviews } from '../../types/contract';
export default function StoreReviews({ storeId }: { storeId: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<Reviews>();
  const [hasOwn, setHasOwn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .getReviews(storeId, 3)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [storeId, user?.id]);
  const mine = data?.items.find((r) => r.mine);
  async function mutate(remove = false) {
    setBusy(true);
    setError('');
    try {
      if (remove) await api.deleteReview(storeId);
      else await api.saveReview(storeId, { rating, body });
      setData(await api.getReviews(storeId, 3));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message: string }).message);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      const page = await api.getReviews(storeId, 20, data.items.length);
      setData({ ...page, items: [...data.items, ...page.items] });
    } catch (e) {
      setError((e as { message: string }).message);
    } finally {
      setBusy(false);
    }
  }
  async function write() {
    if (!user) {
      navigate(`/merchant/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setError('');
    setBusy(true);
    try {
      // Search all pages so an older personal review can still be edited.
      let offset = 0;
      let own;
      while (true) {
        const page = await api.getReviews(storeId, 100, offset);
        own = page.items.find((r) => r.mine);
        if (own || offset + page.items.length >= page.count) break;
        offset += page.items.length;
      }
      setHasOwn(Boolean(own));
      setRating(own?.rating ?? 5);
      setBody(own?.body ?? '');
      setEditing(true);
    } catch (e) {
      setError((e as { message: string }).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="점포 리뷰">
      <h2>손님 리뷰</h2>
      {data && (
        <>
          <p>
            ★ {data.average?.toFixed(1) ?? '—'} · 손님 {data.count}명 평가
          </p>
          {data.items.map((r) => (
            <article key={r.id}>
              <p>
                ★ {r.rating} · {r.author}
                {r.mine ? ' · 내 리뷰' : ''}
              </p>
              <p>{r.body}</p>
            </article>
          ))}
          {data.count > data.items.length && (
            <button disabled={busy} onClick={() => void more()}>
              리뷰 더 보기
            </button>
          )}
        </>
      )}
      {user && user.role !== 'customer' ? (
        <p>리뷰는 손님 계정으로 쓸 수 있어요</p>
      ) : (
        <button disabled={busy} onClick={() => void write()}>
          {mine ? '리뷰 고치기' : '리뷰 쓰기'}
        </button>
      )}
      {editing && user?.role === 'customer' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate();
          }}
        >
          <div role="group" aria-label="별점">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}점`}
                aria-pressed={rating === n}
                onClick={() => setRating(n)}
              >
                {n <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
          <label>
            리뷰 글
            <textarea
              required
              maxLength={200}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p>{200 - [...body].length}자 남음</p>
          <button disabled={busy}>저장</button>
          {hasOwn && (
            <button type="button" disabled={busy} onClick={() => void mutate(true)}>
              내 리뷰 지우기
            </button>
          )}
          <button type="button" onClick={() => setEditing(false)}>
            취소
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

import { useT } from '../../i18n';
import Button from '../common/Button';
import ErrorBox from '../common/ErrorBox';
import s from './reviews.module.css';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import * as api from '../../api/reviews';
import type { StoreReviews as Reviews } from '../../types/contract';
export default function StoreReviews({ storeId }: { storeId: string }) {
  const t = useT();
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
      navigate(
        `/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`,
      );
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
    <section className={s.reviews} aria-label="점포 리뷰">
      <h2>{t('reviewTitle')}</h2>
      {data && (
        <>
          <p>
            ★ {data.average?.toFixed(1) ?? '—'} · 손님 {data.count}명 평가
          </p>
          {data.items.map((r) => (
            <article key={r.id}>
              <p>
                ★ {r.rating} · {r.author}
                {r.mine ? ` · ${t('reviewMine')}` : ''}
              </p>
              <p>{r.body}</p>
            </article>
          ))}
          {data.count > data.items.length && (
            <Button disabled={busy} onClick={() => void more()}>
              {t('reviewMore')}
            </Button>
          )}
        </>
      )}
      {user && user.role !== 'customer' ? (
        <p>{t('reviewCustomerOnly')}</p>
      ) : (
        <Button disabled={busy} onClick={() => void write()}>
          {mine ? t('reviewEdit') : t('reviewWrite')}
        </Button>
      )}
      {editing && user?.role === 'customer' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate();
          }}
        >
          <div role="group" aria-label={t('reviewRating')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                aria-label={`${n}점`}
                aria-pressed={rating === n}
                onClick={() => setRating(n)}
              >
                {n <= rating ? '★' : '☆'}
              </Button>
            ))}
          </div>
          <label>
            {t('reviewBody')}
            <textarea
              required
              maxLength={200}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p>{200 - [...body].length}자 남음</p>
          <Button type="submit" variant="primary" disabled={busy}>
            {t('reviewSave')}
          </Button>
          {hasOwn && (
            <Button type="button" disabled={busy} onClick={() => void mutate(true)}>
              {t('reviewDelete')}
            </Button>
          )}
          <Button type="button" onClick={() => setEditing(false)}>
            {t('reviewCancel')}
          </Button>
        </form>
      )}
      {error && <ErrorBox message={error} />}
    </section>
  );
}

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import { getFavorites, saveFavorite, removeFavorite } from '../../api/favorites';
import Icon from '../common/Icon';
import Button from '../common/Button';
export default function FavoriteButton({
  storeId,
  name,
  marketId,
}: {
  storeId: string;
  name: string;
  marketId: string;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useResource(
    useCallback(() => (user?.role === 'customer' ? getFavorites() : Promise.resolve([])), [user]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = !!state.data?.some((f) => f.store_id === storeId);
  async function toggle() {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (user.role !== 'customer') {
      setError('손님 계정으로 단골을 저장할 수 있어요');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (saved) await removeFavorite(storeId);
      else await saveFavorite({ store_id: storeId, name, market_id: marketId });
      state.retry();
    } catch {
      setError('단골을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="md"
        type="button"
        aria-label={saved ? '단골 해제' : '단골 저장'}
        aria-pressed={saved}
        disabled={busy}
        onClick={() => {
          void toggle();
        }}
      >
        <Icon name="star" />
        {saved ? '단골 해제' : '단골 저장'}
      </Button>
      {!user && <span>로그인하면 단골을 저장할 수 있어요</span>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

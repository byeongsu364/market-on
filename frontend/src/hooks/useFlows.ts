import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchItems } from '../api/items';
import { useResource } from './useResource';
import { useSession } from '../store/session';
export const useItemCatalog = () => useResource(useCallback(() => searchItems(''), []));
export function useMarketChoice() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  return (market: NonNullable<typeof session.market>) => {
    session.setMarket(market);
    const from = (
      location.state as {
        from?: string;
      } | null
    )?.from;
    // 돌아갈 화면이 없으면 고른 시장 안 지도로
    navigate(from ?? `/?market=${encodeURIComponent(market.market_id)}`, { replace: true });
  };
}
export function useRequireMarket() {
  const { market, marketLoading, unsupported } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!market && !marketLoading && !(unsupported && location.pathname === '/'))
      navigate('/markets', { replace: true, state: { from: location.pathname + location.search } });
  }, [market, marketLoading, unsupported, navigate, location.pathname, location.search]);
  return !!market;
}

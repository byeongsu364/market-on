import { useLocation, useSearchParams } from 'react-router-dom';
import { useSession } from '../../store/session';
import MapOutside from './MapOutside';
import MapInside from './MapInside';

/**
 * 첫 화면 `/`(지시서 030 3장).
 * - `?market=` 이 있으면 시장 안(점포 목록 시트), `&item=` 까지 있으면 품목 검색 결과.
 * - 주소에 시장이 없으면 시안(Main)대로 지도 홈(지도 + 가까운 시장 카드 + 둘러보기)을 먼저 보임.
 *   1km 안 시장이 자동으로 골라져도(store/session.ts) 바로 시장 안으로 들어가지 않음(2026-11-27: 첫 화면에 지도가
 *   안 보이고 평면도만 보이던 문제). 품목만 왔으면(옛 `/map?item=`) 세션 시장 안을 보임.
 */
export default function MapHome() {
  const [params] = useSearchParams();
  const session = useSession();
  const location = useLocation();
  const around = (location.state as { around?: boolean } | null)?.around;
  const marketId =
    params.get('market') ?? (!around && params.get('item') ? session.market?.market_id : undefined);
  return marketId ? <MapInside key={marketId} marketId={marketId} /> : <MapOutside />;
}

import { useLocation, useSearchParams } from 'react-router-dom';
import { useSession } from '../../store/session';
import MapOutside from './MapOutside';
import MapInside from './MapInside';

/**
 * 첫 화면 `/`(지시서 030 3장).
 * - `?market=` 이 있으면 시장 안(점포 목록 시트), `&item=` 까지 있으면 품목 검색 결과.
 * - 주소에 시장이 없어도 오늘 1km 안 시장이 자동으로 골라졌거나(store/session.ts) 품목만 왔으면(옛 `/map?item=`)
 *   세션 시장 안을 보임. 시장 안에서 뒤로 나오면(state.around) 주변 시장을 보임.
 */
export default function MapHome() {
  const [params] = useSearchParams();
  const session = useSession();
  const location = useLocation();
  const around = (location.state as { around?: boolean } | null)?.around;
  const marketId =
    params.get('market') ??
    (!around && (session.automatic || params.get('item')) ? session.market?.market_id : undefined);
  return marketId ? <MapInside key={marketId} marketId={marketId} /> : <MapOutside />;
}

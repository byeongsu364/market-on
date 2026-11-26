// 지시서 030 8단계(상인·시장 관리자 화면)의 mock 전용 값.
// 백엔드에 아직 없는 것(030 5장 표): 오늘 품절 스위치, 가게 위치 저장, 단골 수, 경계·편의시설·공지 편집.
// 모두 "예시 값"이에요. 단골 수와 점포 위치는 geo.ts의 예시 계산식을 그대로 써서 지도 화면과 같은 값이 나와요.
// 시장 관리자 API(/market-admin/*)는 원래 mock이 없어 mock 모드에서 화면이 열리도록 같은 계정 목록으로 더했어요.
import type {
  LatLng,
  MarketMerchant,
  MarketSummary,
  MerchantExtras,
  User,
} from '../../types/contract';
import { zones } from '../../constants/zones';
import { markets, stores } from './data';
import { storeExtra } from './geo';
import { currentMockUser, mockUsers, onMockReset } from './merchant';

const soldOut = new Map<string, Set<string>>();
const locations = new Map<string, LatLng>();
export const storeLocation = (id: string) => {
  const point = locations.get(id);
  return point ? { ...point, verified: true } : {};
};
const notices = new Map<string, string>();
onMockReset(() => {
  soldOut.clear();
  locations.clear();
  notices.clear();
});

function myStore() {
  const user = currentMockUser();
  if (user?.role !== 'merchant' || user.status !== 'approved' || !user.store)
    throw new Error('승인된 상인만 쓸 수 있어요.');
  return user.store;
}
/** 예시 값: geo.ts의 점포 예시(위경도, 단골 수) */
function example(storeId: string) {
  const index = stores.findIndex((s) => s.store_id === storeId);
  const store = stores[index];
  if (!store) return null;
  return storeExtra(store, index, zones.find((z) => z.id === store.zone_id)?.name ?? '');
}

export async function extras(): Promise<MerchantExtras> {
  const { store_id } = myStore();
  const ex = example(store_id);
  const saved = locations.get(store_id);
  return {
    favorites: ex?.favorites ?? 0,
    sold_out_item_ids: [...(soldOut.get(store_id) ?? [])],
    location: saved ?? (ex?.lat && ex.lng ? { lat: ex.lat, lng: ex.lng } : null),
    location_confirmed: !!saved,
  };
}
export async function setSoldOut(item_id: string, out: boolean) {
  const { store_id } = myStore();
  const set = soldOut.get(store_id) ?? new Set<string>();
  if (out) set.add(item_id);
  else set.delete(item_id);
  soldOut.set(store_id, set);
  return extras();
}
export async function saveLocation(point: LatLng) {
  const { store_id } = myStore();
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng))
    throw new Error('위치를 확인해 주세요.');
  locations.set(store_id, { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6) });
  return extras();
}

// 시장 관리자 ---------------------------------------------------------------
function manager() {
  const user = currentMockUser();
  if (user?.role !== 'market_admin' || user.status !== 'approved' || !user.market)
    throw new Error('승인된 시장 관리자만 쓸 수 있어요.');
  return user.market;
}
const merchantsOf = (market_id: string) =>
  mockUsers().filter(
    (u): u is typeof u & { store: NonNullable<User['store']> } =>
      u.role === 'merchant' && !!u.store && u.store.market_id === market_id,
  );
export async function marketSummary(): Promise<MarketSummary> {
  const m = manager();
  const list = merchantsOf(m.market_id);
  return {
    market_id: m.market_id,
    name: m.name,
    stores_total: m.market_id === markets[0].market_id ? stores.length : 0,
    merchants_approved: list.filter((u) => u.status === 'approved').length,
    merchants_pending: list.filter((u) => u.status === 'pending').length,
    views_7d: 0,
  };
}
export async function marketMerchants(status: User['status']): Promise<MarketMerchant[]> {
  const m = manager();
  return merchantsOf(m.market_id)
    .filter((u) => u.status === status)
    .map((u) => ({
      id: u.id,
      login_id: u.login_id,
      status: u.status,
      created_at: u.created_at,
      store: { store_id: u.store.store_id, name: u.store.name },
    }));
}
export async function marketDecide(id: string, action: 'approve' | 'reject' | 'disable') {
  const m = manager();
  const user = merchantsOf(m.market_id).find((u) => u.id === id);
  if (!user) throw new Error('상인을 찾을 수 없어요.');
  user.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'disabled';
  return { user };
}
export async function marketPoster() {
  const m = manager();
  return {
    market_name: m.name,
    url: `${window.location.origin}/?market=${encodeURIComponent(m.market_id)}`,
  };
}
export async function notice() {
  return notices.get(manager().market_id) ?? '';
}
export async function saveNotice(text: string) {
  const value = text.trim().slice(0, 200);
  notices.set(manager().market_id, value);
  return value;
}

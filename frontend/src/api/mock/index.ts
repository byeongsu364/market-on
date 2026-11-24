import type {
  MarketMap,
  Price,
  PriceRequest,
  RecognizeResponse,
  RecommendRequest,
  RecommendResponse,
} from '../../types/contract';
import { record } from './marketRequests';
import { items, markets, stores, source } from './data';
import { activeForStore, storePrice } from './merchant';
import { zones } from '../../constants/zones';
import { convertUnit } from '../../utils/convertUnit';
import { diffPct } from '../../utils/diffPct';
export async function mock<T>(work: () => T): Promise<T> {
  await new Promise((r) => setTimeout(r, 240));
  if (new URLSearchParams(window.location.search).get('fail') === '1')
    throw { code: 'MOCK_FAILURE', message: '샘플 요청에 실패했어요. 다시 시도해 주세요.' };
  return work();
}
export const nearby = (lat?: number, lng?: number) =>
  mock(() =>
    [...markets]
      .map((m) => ({
        ...m,
        distance_m:
          lat == null || lng == null
            ? null
            : Math.round(Math.hypot(m.lat - lat, m.lng - lng) * 111000),
      }))
      .map((m) => {
        if (m.status === 'listed' && m.distance_m !== null && m.distance_m <= 1000)
          record(m.market_id, 'nearby');
        return m;
      })
      .sort((a, b) =>
        lat == null || lng == null
          ? 0
          : Math.hypot(a.lat - lat, a.lng - lng) - Math.hypot(b.lat - lat, b.lng - lng),
      ),
  );
export const recognize = (file: File): Promise<RecognizeResponse> =>
  mock(() => ({
    media_id: '00000000-0000-4000-8000-000000000001',
    price_tag: file.name.includes('price')
      ? { price: 3000, unit_text: '1단', unit: 'unit:bunch', quantity: 1 }
      : null,
    vision_labels: ['green onion', 'scallion'],
    candidates: items.slice(0, 3).map((i, j) => ({
      item_id: i.item_id,
      name: i.name,
      confidence: j === 0 ? (file.name.includes('uncertain') ? 0.65 : 0.94) : 0.3 - j * 0.1,
    })),
  }));
export const getItem = (id: string) =>
  mock(() => {
    const item = items.find((i) => i.item_id === id);
    if (!item) throw { code: 'NOT_FOUND', message: '품목을 찾을 수 없어요.' };
    return item;
  });
export const search = (q: string) =>
  mock(() =>
    items.filter((i) =>
      [...i.synonyms, ...i.vision_labels].some((n) => n.toLowerCase().includes(q.toLowerCase())),
    ),
  );
export const price = (q: PriceRequest): Promise<Price> =>
  mock(() => {
    const base = q.item_id === 'item:green_onion' ? 2576 : q.item_id === 'item:onion' ? 2100 : 3200;
    const reference_price = Math.round(convertUnit(base, 'kg', q.unit));
    return {
      ...q,
      reference_price,
      diff_pct: q.seen_price == null ? null : diffPct(q.seen_price, reference_price),
      region: '서울',
      observed_on: '2026-11-20',
      fallback: null,
      source: q.item_id === 'item:green_onion' ? source : '팀 작성 예시 가격 · 2026-11-20 · 샘플',
      by_market_type: {
        traditional: { price: reference_price, count: 15 },
        large_retail: {
          price: Math.round(
            convertUnit(q.item_id === 'item:green_onion' ? 2451 : base, 'kg', q.unit),
          ),
          count: 34,
        },
      },
    };
  });
export const map = (market_id: string, item_id?: string, unit?: string): Promise<MarketMap> =>
  mock(() => ({
    market_id,
    zones,
    stores: stores
      .map((s) => ({
        ...s,
        highlight: !!item_id && s.sells.includes(item_id),
        active_sale: activeForStore(s.store_id, item_id),
        price: item_id && s.sells.includes(item_id) ? storePrice(s.store_id, item_id, unit) : null,
      }))
      .sort(
        (a, b) =>
          (item_id
            ? (a.price ? Number(a.price.stale) : 2) - (b.price ? Number(b.price.stale) : 2)
            : 0) || Number(!!b.active_sale) - Number(!!a.active_sale),
      ),
  }));
export const recommend = (q: RecommendRequest): Promise<RecommendResponse> =>
  mock(() => ({
    items: items.slice(0, 3).map((i) => ({
      item_id: i.item_id,
      name: i.name,
      reason: `${q.purpose} · ${q.headcount}명 · 예산 ${q.budget.toLocaleString()}원에 맞춘 구성 예시 · 샘플`,
      stores: stores.filter((s) => s.sells.includes(i.item_id)).map((s) => s.store_id),
      sources: ['팀 구성 예시 · 샘플'],
    })),
  }));

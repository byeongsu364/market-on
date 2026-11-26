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
      ? { price: 3000, unit_text: '1단', unit: 'unit:bunch', quantity: 1, variety_id: null }
      : null,
    model: 'gemma4:e4b',
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
    const varieties =
      q.item_id === 'item:apple'
        ? [
            {
              variety_id: 'variety:apple-fuji',
              name: '후지',
              reference_price: 3200,
              default: true,
            },
            {
              variety_id: 'variety:apple-hongro',
              name: '홍로',
              reference_price: 3500,
              default: false,
            },
            {
              variety_id: 'variety:apple-shinano-gold',
              name: '시나노골드',
              reference_price: null,
              default: false,
            },
          ].map((v) => ({
            ...v,
            unit: q.unit,
            observed_on: v.reference_price === null ? null : '2026-11-20',
            count: v.reference_price === null ? 0 : 15,
          }))
        : [];
    const selected = varieties.find((v) => v.variety_id === q.variety_id) ?? varieties[0];
    const reference_price =
      selected?.reference_price ?? Math.round(convertUnit(base, 'kg', q.unit));
    return {
      ...q,
      variety_id: selected?.variety_id ?? null,
      variety_name: selected?.name ?? null,
      varieties,
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
    layout: 'schematic',
    source_note: '시연용 예시 배치',
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
  mock(() => {
    const chosen = items
      .filter((i) => q.purpose !== '선물' || ['item:apple', 'item:pear'].includes(i.item_id))
      .slice(0, 3);
    const quantity = 1;
    const unit_price = 1000;
    const total = chosen.length * unit_price;
    return {
      items: chosen.map((i) => ({
        item_id: i.item_id,
        name: i.name,
        quantity,
        unit: i.default_unit,
        unit_label:
          i.default_unit === 'unit:bunch' ? '단' : i.default_unit === 'unit:kg' ? 'kg' : '개',
        unit_price,
        subtotal: unit_price,
        reason: `${q.purpose}에 맞춰 넣은 구성 예시예요.`,
        stores: stores
          .filter((s) => s.sells.includes(i.item_id))
          .slice(0, 3)
          .map((s) => ({ store_id: s.store_id, name: s.name })),
        sources: [
          { title: '팀 구성 예시 · 샘플', publisher: null, url: null, license: null, draft: true },
        ],
      })),
      total,
      budget: q.budget,
      left: q.budget - total,
      note: '기준시세로 계산한 예상 금액이에요. 실제 가격은 가게마다 달라요',
      model: null,
    };
  });

export async function ask(
  data: import('../../types/contract').AskRequest,
): Promise<import('../../types/contract').AskResponse> {
  const intent = data.intent ?? (data.question?.includes('가격') ? 'price' : 'store');
  const item = items.find((i) => i.item_id === data.item_id || data.question?.includes(i.name));
  const base: import('../../types/contract').AskResponse = {
    kind: 'need_item',
    intent,
    item_id: item?.item_id ?? null,
    item_name: item?.name ?? null,
    answer: null,
    citations: [],
    model: null,
    cached: false,
    removed: 0,
  };
  if (!item)
    return mock(() => ({
      ...base,
      candidates: items.slice(0, 5).map((i) => ({ item_id: i.item_id, name: i.name })),
    }));
  if (intent === 'price')
    return {
      ...base,
      kind: 'price',
      price: await price({
        item_id: item.item_id,
        market_id: data.market_id ?? '',
        unit: item.default_unit,
      }),
    };
  if (intent === 'where') {
    if (!data.market_id)
      throw { code: 'MARKET_REQUIRED', message: '시장을 선택해 주세요.', status: 422 };
    return mock(() => ({
      ...base,
      kind: 'where',
      stores: stores
        .filter((s) => s.sells.includes(item.item_id))
        .map((s) => ({ store_id: s.store_id, name: s.name })),
    }));
  }
  if (item.item_id === 'item:green_onion' && intent === 'store')
    return mock(() => ({
      ...base,
      kind: 'answer',
      answer:
        '대파는 비닐봉지나 신문지에 싸서 냉장 보관해요. 씻었다면 물기를 없앤 뒤 밀폐용기에 담아 냉장 보관해요.',
      model: 'mock',
      citations: [
        {
          title: '이달의 식재료 - 움파(대파) · 샘플',
          draft: true,
          publisher: '농촌진흥청 농사로',
          url: null,
          license: null,
        },
      ],
    }));
  return mock(() => ({ ...base, kind: 'no_evidence', answer: '이 품목의 자료가 아직 없어요.' }));
}

export async function chat(
  data: import('../../types/contract').ChatRequest,
): Promise<import('../../types/contract').ChatResponse> {
  const question = data.messages.at(-1)?.content ?? '';
  if (question.includes('대파') || data.item_id === 'item:green_onion') {
    const result = await ask({
      item_id: 'item:green_onion',
      intent: 'store',
      market_id: data.market_id,
    });
    return {
      reply: result.answer ?? '이 품목의 자료가 아직 없어요.',
      citations: result.citations,
      tools: [{ name: 'ask_knowledge', label: '근거 자료 찾기' }],
      items: [{ item_id: 'item:green_onion', name: '대파' }],
      model: result.model,
      removed: 0,
    };
  }
  return mock(() => ({
    reply: '이 시장 장보기 질문을 도와드릴 수 있어요',
    citations: [],
    tools: [],
    items: [],
    model: null,
    removed: 0,
  }));
}

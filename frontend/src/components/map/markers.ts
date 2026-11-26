import type { Facility, LatLng, StoreCategory } from '../../types/contract';
import type { MapViewProps } from './MapView';
import { CATEGORY_LABELS } from '../../utils/category';

// 지도 위 표시물의 HTML. 네이버 지도(HTML 마커)와 약도가 같은 문자열을 씀(디자인 시스템 "색" 핀 규칙).
// 모든 표시물은 끝점(또는 가운데)이 좌표에 오도록 margin으로 맞춤.

/** small: 핀이 많을 때(30개 넘게) 한 단계 작은 물방울 핀 */
export type PinState = 'default' | 'selected' | 'dim' | 'small';
export type MapPin = LatLng & {
  id: string;
  name: string;
  category: StoreCategory | null;
  state?: PinState;
  sale?: boolean;
  /** 선택 말풍선의 둘째 줄(가격 등) */
  caption?: string;
};
export type MapMarketLabel = LatLng & { id: string; name: string; active: boolean };
export type MapStop = LatLng & { id: string; order: number; done?: boolean; name: string };
export type MapMarker =
  | ({ type: 'pin' } & MapPin)
  | ({ type: 'facility' } & Facility & { id: string })
  | ({ type: 'market' } & MapMarketLabel)
  | ({ type: 'stop' } & MapStop)
  | ({ type: 'me' } & LatLng & { id: string });

const DROP =
  'M16 1.5C8 1.5 1.5 7.9 1.5 15.8c0 6.3 4 10.2 8.3 14.1 2.6 2.3 4.7 4.6 6.2 8.1 1.5-3.5 3.6-5.8 6.2-8.1 4.3-3.9 8.3-7.8 8.3-14.1C30.5 7.9 24 1.5 16 1.5z';
const glyph: Record<StoreCategory, string> = {
  produce:
    '<path fill="#fff" d="M12 8.3c-1.7-1.5-5.7-1.2-5.7 3.4 0 3.9 2.9 7.8 5.7 6.6 2.8 1.2 5.7-2.7 5.7-6.6 0-4.6-4-4.9-5.7-3.4z"/><path fill="#fff" d="M12.2 7.2c-.2-2.1 1.2-3.7 3.5-3.9.2 2.2-1.2 3.8-3.5 3.9z"/>',
  dried:
    '<path fill="#fff" d="M8.2 3.8h7.6a.9.9 0 01.9.9v1.5a.9.9 0 01-.9.9H8.2a.9.9 0 01-.9-.9V4.7a.9.9 0 01.9-.9z"/><path fill="#fff" d="M7.6 8.5h8.8c1.3 0 2.3 1 2.3 2.3v7.1c0 1.3-1 2.3-2.3 2.3H7.6c-1.3 0-2.3-1-2.3-2.3v-7.1c0-1.3 1-2.3 2.3-2.3z"/><path fill="#b7791f" d="M8 12.2h8v3.6H8z"/>',
  seafood:
    '<path fill="#fff" d="M2.8 12c2.1-3.3 5.2-5 8.4-5 2.9 0 5.4 1.5 6.9 3.3l3.1-2.7v8.8l-3.1-2.7c-1.5 1.8-4 3.3-6.9 3.3-3.2 0-6.3-1.7-8.4-5z"/><circle fill="#2477e0" cx="7.6" cy="11.2" r="1.15"/>',
  side: '<path fill="#fff" d="M3.5 11.5h17c0 4.4-3.5 8-8.5 8s-8.5-3.6-8.5-8z"/><path fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" d="M8.5 8.5c0-1.5 1.2-1.5 1.2-3M13.3 8.5c0-1.5 1.2-1.5 1.2-3"/>',
  meat: '<circle fill="#fff" cx="10" cy="9.8" r="6.3"/><path fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" d="M13.5 13.3l4.7 4.7"/><circle fill="#fff" cx="19.7" cy="17.3" r="1.9"/><circle fill="#fff" cx="17.3" cy="19.7" r="1.9"/><path fill="none" stroke="#e0484e" stroke-width="1.5" stroke-linecap="round" d="M7 8.4c.6-1.3 1.7-2.1 3.1-2.3"/>',
  ricecake:
    '<path fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" d="M4 20L20 4"/><circle fill="#fff" cx="8" cy="16" r="3.3"/><circle fill="#fff" cx="12.2" cy="11.8" r="3.3"/><circle fill="#fff" cx="16.4" cy="7.6" r="3.3"/>',
};
const pinColor: Record<StoreCategory, string> = {
  produce: '#1f9d55',
  dried: '#b7791f',
  seafood: '#2477e0',
  side: '#8a56d6',
  meat: '#e0484e',
  ricecake: '#d2488f',
};
const facilityPath = {
  entrance:
    '<path d="M10.5 5H7A1.5 1.5 0 005.5 6.5v11A1.5 1.5 0 007 19h3.5"/><path d="M19 12h-8.5M14 8.5L10.5 12l3.5 3.5"/>',
  parking: '<path d="M9 19V5.5h4.3a3.7 3.7 0 010 7.4H9"/>',
  toilet:
    '<circle cx="8" cy="5.8" r="1.6"/><circle cx="16" cy="5.8" r="1.6"/><path d="M8 9.5v9.5M5.5 12.5L8 9.5l2.5 3M16 9.5v9.5M13.5 15l2.5-5.5 2.5 5.5z"/>',
};
export const FACILITY_NAMES = { entrance: '입구', parking: '주차장', toilet: '화장실' };

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** 표시물 안쪽 HTML(겉 요소는 렌더러가 만듦) */
export function markerInner(m: MapMarker): string {
  switch (m.type) {
    case 'pin': {
      if (m.state === 'dim') return '<span class="mo-dot"></span>';
      const selected = m.state === 'selected';
      // small: 핀이 많을 때 한 단계 작은 물방울 핀(아이콘은 그대로)
      const [w, h, g, gx, gy] = selected
        ? [44, 55, 23, 10.5, 9.8]
        : m.state === 'small'
          ? [24, 30, 13, 5.5, 5.2]
          : [30, 37.5, 16, 7, 6.5];
      const fill = m.category ? pinColor[m.category] : '#8b8d93';
      const icon = m.category
        ? `<svg width="${g}" height="${g}" viewBox="0 0 24 24" aria-hidden="true">${glyph[m.category]}</svg>`
        : '';
      return (
        `<span class="mo-pin" style="width:${w}px;height:${h}px;margin:-${h}px 0 0 -${w / 2}px">` +
        `<svg width="${w}" height="${h}" viewBox="0 0 32 40" aria-hidden="true"><path d="${DROP}" fill="${fill}" stroke="${selected ? '#171717' : '#ffffff'}" stroke-width="${selected ? 2.2 : 2}"/></svg>` +
        `<span class="mo-pin-glyph" style="left:${gx}px;top:${gy}px">${icon}</span>` +
        (m.sale ? '<span class="mo-pin-sale"></span>' : '') +
        `</span>` +
        (selected
          ? `<span class="mo-bubble" style="transform:translate(-50%,-${h + 44}px)">${esc(m.name)}${m.caption ? `<span class="mo-bubble-sub">${esc(m.caption)}</span>` : ''}</span>`
          : '')
      );
    }
    case 'facility':
      return `<span class="mo-facility"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#171717" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${facilityPath[m.kind]}</svg></span>`;
    case 'market':
      return m.active
        ? `<span class="mo-market mo-market-active"><span class="mo-market-dot"></span>${esc(m.name)}</span>`
        : `<span class="mo-market">${esc(m.name)}</span>`;
    case 'stop':
      return `<span class="mo-stop${m.done ? ' mo-stop-done' : ''}">${m.order}</span>`;
    case 'me':
      return '<span class="mo-me"></span>';
  }
}

/** 화면 읽기 프로그램용 이름 */
export function markerLabel(m: MapMarker): string {
  switch (m.type) {
    case 'pin': {
      const cat = m.category ? `${CATEGORY_LABELS[m.category]} 점포` : '점포';
      return [m.name, cat, m.sale ? '마감세일 중' : '', m.state === 'selected' ? '선택됨' : '']
        .filter(Boolean)
        .join(', ');
    }
    case 'facility':
      return m.name || FACILITY_NAMES[m.kind];
    case 'market':
      return m.active ? m.name : `${m.name}, 준비 중`;
    case 'stop':
      return `${m.order}번째 ${m.name}${m.done ? ', 산 곳' : ''}`;
    case 'me':
      return '내 위치';
  }
}

export function toMarkers(p: MapViewProps): MapMarker[] {
  return [
    ...(p.facilities ?? []).map((f, i) => ({ ...f, type: 'facility' as const, id: `f${i}` })),
    ...(p.markets ?? []).map((m) => ({ ...m, type: 'market' as const })),
    // 줄인 점을 먼저, 선택된 핀을 마지막에(위에 그려지도록)
    ...[...(p.pins ?? [])]
      .sort((a, b) => rank(a) - rank(b))
      .map((m) => ({ ...m, type: 'pin' as const })),
    ...(p.stops ?? []).map((m) => ({ ...m, type: 'stop' as const })),
    ...(p.me ? [{ ...p.me, type: 'me' as const, id: 'me' }] : []),
  ];
}
const rank = (p: MapPin) => (p.state === 'dim' ? 0 : p.state === 'selected' ? 2 : 1);

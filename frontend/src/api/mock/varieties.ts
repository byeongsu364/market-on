import type { VarietyExtra } from '../../types/contract';
const catalog: Record<string, [string, string, VarietyExtra][]> = {
  'item:apple': [
    [
      'variety:apple-fuji',
      '후지',
      {
        synonyms: ['부사'],
        description: '완전히 익으면 과육 속에 꿀이 생기고 저장성이 좋아요.',
        description_source: '농촌진흥청 농사로 · 이달의 식재료 사과',
        harvest: { label: '10월 하순 이후', from: '10' },
      },
    ],
    [
      'variety:apple-hongro',
      '홍로',
      {
        description: '국내에서 처음 육성한 품종이에요.',
        description_source: '농촌진흥청 농사로 · 이달의 식재료 사과',
        harvest: { label: '9월 상·중순', from: '09', to: '09' },
      },
    ],
    ['variety:apple-shinano-gold', '시나노골드', {}],
  ],
  'item:pear': [['variety:pear-shingo', '신고', { synonyms: ['신고배'] }]],
  'item:sweet_persimmon': [
    [
      'variety:sweet_persimmon-fuyu',
      '부유',
      {
        description: '한 개 220~230g 정도, 껍질은 등황색, 당도는 15~16°Bx 정도예요.',
        description_source: '농촌진흥청 농사로 · 이달의 식재료 감',
        harvest: { label: '10월 하순~11월 상순', from: '10', to: '11' },
      },
    ],
  ],
  'item:green_onion': [['variety:green_onion-daepa', '대파', {}]],
  'item:onion': [['variety:onion-onion', '양파', {}]],
};
export const mockVarieties = (item: string) =>
  (catalog[item] ?? []).map(([variety_id, name, extra]) => ({
    variety_id,
    name,
    description: null,
    description_source: null,
    harvest: null,
    synonyms: [],
    ...extra,
  }));

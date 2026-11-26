import type { VarietyExtra } from '../../types/contract';
const catalog: Record<string, [string, string, VarietyExtra][]> = {
  'item:mandarin': [
    ['variety:mandarin-open', '노지', { synonyms: ['노지감귤', '온주밀감'] }],
    ['variety:mandarin-greenhouse', '시설', { synonyms: ['하우스감귤'], mock: true }],
  ],
  'item:apple': [
    [
      'variety:apple-fuji',
      '후지',
      {
        synonyms: ['부사'],
        description: '완전히 익으면 과육 속에 꿀이 생기고 저장성이 좋아요.',
        description_source: '농촌진흥청 국립식량과학원 · 이달의 식재료 사과',
        harvest: { label: '10월 하순 이후', from: '10' },
      },
    ],
    [
      'variety:apple-hongro',
      '홍로',
      {
        description: null,
        description_source: null,
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
catalog['item:pear'].push(['variety:pear-noksu', '녹수', { mock: true }]);
catalog['item:pear'].push(['variety:pear-hanareum', '한아름', { mock: true }]);
catalog['item:pear'].push(['variety:pear-manpung', '만풍배', { mock: true }]);
catalog['item:sweet_persimmon'].push(['variety:sweet_persimmon-gampung', '감풍', { mock: true }]);
catalog['item:sweet_persimmon'].push(['variety:sweet_persimmon-romang', '로망', { mock: true }]);
catalog['item:sweet_persimmon'].push(['variety:sweet_persimmon-jowan', '조완', { mock: true }]);
catalog['item:onion'].push(['variety:onion-jangilhwang', '장일황', { mock: true }]);
catalog['item:onion'].push(['variety:onion-highland', '고랭지 여름양파', { mock: true }]);
catalog['item:green_onion'].push(['variety:green_onion-cold', '한지형', { mock: true }]);
catalog['item:green_onion'].push(['variety:green_onion-warm', '난지형', { mock: true }]);
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

export const mockMultipliers: Record<string, number> = {
  'variety:pear-noksu': 0.85,
  'variety:pear-hanareum': 0.95,
  'variety:pear-manpung': 1.25,
  'variety:sweet_persimmon-gampung': 1.15,
  'variety:sweet_persimmon-romang': 1.1,
  'variety:sweet_persimmon-jowan': 0.9,
  'variety:onion-jangilhwang': 1.1,
  'variety:onion-highland': 1.2,
  'variety:green_onion-cold': 1.1,
  'variety:green_onion-warm': 0.9,
  'variety:mandarin-greenhouse': 1.25,
};

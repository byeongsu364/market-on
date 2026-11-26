export const convertUnit = (price: number, from: string, to: string) =>
  (price * (to === 'unit:bunch' ? 0.8 : 1)) / (from === 'unit:bunch' ? 0.8 : 1);
const surveyLabels: Record<string, string> = {
  'unit:kg20': '20kg',
  'unit:kg10': '10kg',
  'unit:kg': '1kg',
  'unit:g500': '500g',
  'unit:g100': '100g',
  'unit:head': '1포기',
  'unit:piece': '1개',
  'unit:piece10': '10개',
  'unit:g600': '600g',
  'unit:piece3': '3개',
  'unit:g50': '50g',
  'unit:g150': '150g',
  'unit:piece5': '5개',
  'unit:kg2': '2kg',
  'unit:egg10': '10구',
  'unit:egg30': '30구',
  'unit:liter': '1L',
  'unit:pair': '1손',
  'unit:fish': '1마리',
  'unit:fish10': '10마리',
  'unit:sheet10': '10장',
  'unit:kg5': '5kg',
  'unit:fish5': '5마리',
};
export const unitLabel = (unit: string) =>
  ({
    'unit:bunch': '1단',
    'unit:kg': '1kg',
    'unit:piece': '1개',
    'unit:each': '1개',
    'unit:g': '1g',
    kg: '1kg',
    each: '1개',
  })[unit] ??
  surveyLabels[unit] ??
  unit;

export const convertUnit = (price: number, from: string, to: string) =>
  (price * (to === 'unit:bunch' ? 0.8 : 1)) / (from === 'unit:bunch' ? 0.8 : 1);
export const unitLabel = (unit: string) =>
  ({
    'unit:bunch': '1단',
    'unit:kg': '1kg',
    'unit:piece': '1개',
    'unit:each': '1개',
    'unit:g': '1g',
    kg: '1kg',
    each: '1개',
  })[unit] ?? unit;

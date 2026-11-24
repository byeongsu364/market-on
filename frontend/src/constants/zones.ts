export const zones = ['청과', '채소', '수산', '정육', '반찬', '떡·분식'].map((name, i) => ({
  id: `zone:${i}`,
  name,
  x: (i % 2) * 180 + 8,
  y: Math.floor(i / 2) * 180 + 8,
}));
export const zoneColors = ['#C9B458', '#7FA36B', '#6E9BB0', '#B07A6E', '#A08BB0', '#C4A484'];

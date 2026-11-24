import { saleTime, seoulDay } from './sale';
export function priceTime(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
  const label =
    day === seoulDay()
      ? '오늘'
      : new Intl.DateTimeFormat('ko', {
          timeZone: 'Asia/Seoul',
          month: 'long',
          day: 'numeric',
        }).format(date);
  return `${label} ${saleTime(value)}`;
}

export function saleEnd(hours = 1, close = '20:00') {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const midnight = new Date(`${day}T23:59:59+09:00`).getTime();
  return new Date(
    Math.min(
      hours ? now.getTime() + hours * 3600000 : new Date(`${day}T${close}:00+09:00`).getTime(),
      midnight,
    ),
  ).toISOString();
}
export const saleTime = (value: string) =>
  new Intl.DateTimeFormat('ko', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
export const seoulDay = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

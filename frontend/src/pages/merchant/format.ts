// 상인·운영 화면 문구 도우미
/** "11월 26일" */
export const monthDay = (iso: string) =>
  new Intl.DateTimeFormat('ko', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(
    new Date(iso),
  );
/** 문구 속 {n} 바꾸기 */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

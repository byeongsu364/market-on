// 이름 뒤 조사(받침 유무). 한글이 아니면 받침 없는 쪽을 씀.
const PAIRS = { '은/는': ['은', '는'], '이/가': ['이', '가'], '을/를': ['을', '를'] } as const;
export function josa(word: string, pair: keyof typeof PAIRS) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + PAIRS[pair][batchim ? 0 : 1];
}
/** "{name}"처럼 적은 문구에 값을 채움 */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

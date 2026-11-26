// 받침에 따라 조사를 고름("사과가", "대파가", "양파를", "홍로로"). 한글이 아니면 받침 없는 쪽.
const final = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 : 0;
};
export function josa(word: string, withFinal: string, withoutFinal: string) {
  return word + (final(word) ? withFinal : withoutFinal);
}
/** "으로/로": ㄹ 받침도 "로" */
export function euro(word: string) {
  const f = final(word);
  return word + (f && f !== 8 ? '으로' : '로');
}
const PAIRS = { '은/는': ['은', '는'], '이/가': ['이', '가'], '을/를': ['을', '를'] } as const;
/** 이름 뒤 조사 쌍으로 고르기 */
export const josaPair = (word: string, pair: keyof typeof PAIRS) =>
  josa(word, PAIRS[pair][0], PAIRS[pair][1]);
/** "{name}"처럼 적은 문구에 값을 채움 */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

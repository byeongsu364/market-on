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

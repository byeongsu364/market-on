import ko from './locales/ko.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import vi from './locales/vi.json';
import { useSession } from '../store/session';
import type { Language } from '../types/contract';
export type Key = keyof typeof ko;
const locales: Record<Language, Partial<Record<Key, string>>> = { ko, en, zh, ja, vi };
export const t = (key: Key, lang: Language = 'ko') => locales[lang]?.[key] || ko[key];
export const useT = () => {
  const { language } = useSession();
  return (key: Key) => t(key, language);
};

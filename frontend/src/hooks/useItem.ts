import { useCallback } from 'react';
import { getItem } from '../api/items';
import { useResource } from './useResource';
import { useSession } from '../store/session';
export const useItem = (id: string) => {
  const { language } = useSession();
  return useResource(useCallback(() => getItem(id, language), [id, language]));
};

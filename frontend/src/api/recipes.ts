import { isMock, query, request } from './client';
import type { Recipe, RecipeDetail } from '../types/contract';
import * as mock from './mock/recipes';

export type RecipeQuery = {
  item_id?: string;
  market_id?: string;
  month?: number;
  weather?: 'cold' | 'hot' | 'rain' | 'snow' | 'clear';
  q?: string;
  limit?: number;
};
export const getRecipes = (params: RecipeQuery) =>
  isMock ? mock.getRecipes(params) : request<Recipe[]>(`/recipes?${query(params)}`);
export const getRecipe = (id: string, market_id?: string) =>
  isMock
    ? mock.getRecipe(id)
    : request<RecipeDetail>(`/recipes/${encodeURIComponent(id)}?${query({ market_id })}`);

import type { RecipeDetail } from '../../types/contract';
import type { RecipeQuery } from '../recipes';
import data from './recipes.json';
import { mock } from './index';
const recipes = data as RecipeDetail[];
export const getRecipes = (params: RecipeQuery) =>
  mock(() =>
    recipes
      .filter(
        (recipe) =>
          !params.item_id ||
          recipe.ingredients.some((i) => i.item_id === params.item_id && i.role === '주재료'),
      )
      .slice(0, params.limit ?? 3),
  );
export const getRecipe = (id: string) =>
  mock(() => {
    const recipe = recipes.find((recipe) => recipe.recipe_id === id);
    if (!recipe) throw { message: '레시피를 찾을 수 없습니다.' };
    return recipe;
  });

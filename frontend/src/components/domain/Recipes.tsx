import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRecipe, getRecipes } from '../../api/recipes';
import type { Recipe } from '../../types/contract';
import { useResource } from '../../hooks/useResource';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useT } from '../../i18n';
import Card from '../common/Card';
import { ChipLink } from '../common/Chip';
import ErrorBox from '../common/ErrorBox';
import Loading from '../common/Loading';
import { SectionHeader } from '../common/parts';
import s from './recipes.module.css';

export function RecipeCards({ recipes }: { recipes: Recipe[] }) {
  const t = useT();
  const ctx = useShoppingContext();
  return (
    <div className={s.cards}>
      {recipes.map((recipe) => (
        <Card as="article" key={recipe.recipe_id}>
          <h3>
            <Link to={ctx.href(`/recipes/${encodeURIComponent(recipe.recipe_id)}`)}>
              {recipe.name}
            </Link>
          </h3>
          <p>
            {recipe.dish_type} · {recipe.cook_method}
          </p>
          <p>{recipe.reason}</p>
          <p>
            {t('recipeCoverage')
              .replace('{total}', String(recipe.coverage.total))
              .replace('{available}', String(recipe.coverage.in_market))
              .replace('{stores}', String(recipe.coverage.stores))}
          </p>
        </Card>
      ))}
    </div>
  );
}

export default function Recipes({ itemId }: { itemId?: string }) {
  const t = useT();
  const ctx = useShoppingContext();
  const marketId = ctx.marketId ?? undefined;
  const state = useResource(
    useCallback(
      () => getRecipes({ item_id: itemId, market_id: marketId, limit: 3 }),
      [itemId, marketId],
    ),
  );
  return (
    <section className={s.section}>
      <SectionHeader title={t(itemId ? 'recipeForItem' : 'recipeShopping')} />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} />}
      {state.data &&
        (state.data.length ? <RecipeCards recipes={state.data} /> : <p>{t('recipeEmpty')}</p>)}
    </section>
  );
}

const categories: Record<string, string> = {
  정육: 'meat',
  수산: 'seafood',
  반찬: 'side',
  채소: 'produce',
  과일: 'produce',
  건어물: 'dried',
  떡: 'ricecake',
};
export function RecipePage() {
  const { recipeId = '' } = useParams();
  const ctx = useShoppingContext();
  const marketId = ctx.marketId ?? undefined;
  const t = useT();
  const state = useResource(useCallback(() => getRecipe(recipeId, marketId), [recipeId, marketId]));
  const recipe = state.data;
  return (
    <div className={`page ${s.section}`}>
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} />}
      {recipe && (
        <>
          <h1>{recipe.name}</h1>
          <p>
            {recipe.dish_type} · {recipe.cook_method}
          </p>
          <h2>{t('recipeIngredients')}</h2>
          <ul className={s.ingredients}>
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index}>
                <span>{ingredient.text}</span>
                {ingredient.where === 'outside' ? (
                  <span>{t('recipeOutside')}</span>
                ) : (
                  <ChipLink
                    to={ctx.href(
                      '/',
                      ingredient.item_id ? { item: ingredient.item_id } : {},
                      ingredient.item_id
                        ? undefined
                        : { category: categories[ingredient.store_category ?? ''] },
                    )}
                  >
                    {(ingredient.where === 'item'
                      ? t('recipeItemStores')
                      : t('recipeCategoryStores').replace(
                          '{category}',
                          ingredient.store_category ?? '',
                        )
                    ).replace('{count}', String(ingredient.stores))}
                  </ChipLink>
                )}
              </li>
            ))}
          </ul>
          <h2>{t('recipeSteps')}</h2>
          <div className={s.steps}>{recipe.steps}</div>
          <p>
            {t('recipeSource')}
            {recipe.source.url ? (
              <a
                className="text-link"
                href={recipe.source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('recipeSourceName')}
              </a>
            ) : (
              t('recipeSourceName')
            )}
          </p>
        </>
      )}
    </div>
  );
}

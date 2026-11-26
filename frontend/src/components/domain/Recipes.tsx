import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRecipe, getRecipes } from '../../api/recipes';
import type { Recipe } from '../../types/contract';
import { useResource } from '../../hooks/useResource';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useT } from '../../i18n';
import Icon from '../common/Icon';
import AppHeader from '../layout/AppHeader';
import { ChipLink } from '../common/Chip';
import ErrorBox from '../common/ErrorBox';
import Loading from '../common/Loading';
import { SectionHeader } from '../common/parts';
import s from './recipes.module.css';

export function RecipeCards({ recipes }: { recipes: Recipe[] }) {
  const t = useT();
  const ctx = useShoppingContext();
  return (
    <ul className={s.cards}>
      {recipes.map((recipe) => {
        const { total, in_market } = recipe.coverage;
        return (
          <li key={recipe.recipe_id}>
            <Link
              className={s.card}
              to={ctx.href(`/recipes/${encodeURIComponent(recipe.recipe_id)}`)}
            >
              <span className={s.cardHead}>
                <span className={s.cardTitle}>{recipe.name}</span>
                <Icon name="chevronRight" size={18} />
              </span>
              <span className={s.meta}>
                {recipe.dish_type} · {recipe.cook_method}
              </span>
              <span className={s.reason}>{recipe.reason}</span>
              {/* 재료 중 이 시장에서 살 수 있는 비율(막대 + 글) */}
              <span className={s.coverage}>
                <span className={s.bar} aria-hidden="true">
                  <span style={{ width: `${total ? (in_market / total) * 100 : 0}%` }} />
                </span>
                {t('recipeCoverage')
                  .replace('{total}', String(total))
                  .replace('{available}', String(in_market))
                  .replace('{stores}', String(recipe.coverage.stores))}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
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
    <div className={`page ${s.page}`}>
      <AppHeader title={t('recipeShopping')} />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} />}
      {recipe && (
        <>
          <header className={s.hero}>
            <span className={s.meta}>
              {recipe.dish_type} · {recipe.cook_method}
              {recipe.kcal ? ` · ${recipe.kcal}kcal` : ''}
            </span>
            <h1 className={s.title}>{recipe.name}</h1>
            <p className={s.reason}>{recipe.reason}</p>
          </header>
          <section className={s.block} aria-labelledby="recipe-ingredients">
            <h2 id="recipe-ingredients" className={s.h2}>
              {t('recipeIngredients')}
              <span className={s.count}>
                {recipe.coverage.in_market}/{recipe.coverage.total}
              </span>
            </h2>
            <ul className={s.ingredients}>
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index}>
                  <span className={s.ingredient}>{ingredient.text}</span>
                  {ingredient.where === 'outside' ? (
                    <span className={s.outside}>{t('recipeOutside')}</span>
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
          </section>
          <section className={s.block} aria-labelledby="recipe-steps">
            <h2 id="recipe-steps" className={s.h2}>
              {t('recipeSteps')}
            </h2>
            {/* 원문 그대로, 줄마다 한 단계 */}
            <ol className={s.steps}>
              {recipe.steps
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i}>{line.replace(/^\d+\.\s*/, '')}</li>
                ))}
            </ol>
          </section>
          <p className="caption">
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

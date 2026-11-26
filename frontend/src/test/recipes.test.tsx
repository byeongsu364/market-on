import { storeCategory } from '../utils/category';
import { SessionProvider } from '../store/SessionProvider';
import { expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Recipes, { RecipePage } from '../components/domain/Recipes';
import { getRecipe, getRecipes } from '../api/recipes';
import data from '../api/mock/recipes.json';
import type { RecipeDetail } from '../types/contract';
vi.mock('../api/recipes', () => ({ getRecipe: vi.fn(), getRecipes: vi.fn() }));
const fixture = data[0] as RecipeDetail;
beforeEach(() => {
  vi.mocked(getRecipes).mockResolvedValue([fixture]);
  vi.mocked(getRecipe).mockResolvedValue(fixture);
});
it('결과·Shop 공통 카드가 시장과 품목으로 목록을 요청한다', async () => {
  render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/?market=m']}>
        <Recipes itemId="item:green_onion" />
      </MemoryRouter>
    </SessionProvider>,
  );
  await screen.findByText(fixture.name);
  expect(getRecipes).toHaveBeenCalledWith({
    item_id: 'item:green_onion',
    market_id: 'm',
    limit: 3,
  });
  expect(screen.getByRole('heading', { name: '이 재료로 만드는 요리' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: fixture.name })).toHaveAttribute(
    'href',
    `/recipes/${encodeURIComponent(fixture.recipe_id)}?market=m`,
  );
});
it('상세는 원문 조리법과 시장·카테고리·시장 밖 재료를 표시한다', async () => {
  const detail: RecipeDetail = {
    ...fixture,
    ingredients: [
      {
        text: '대파 1대',
        item_id: 'item:green_onion',
        store_category: null,
        role: '주재료',
        where: 'item',
        stores: 2,
      },
      {
        text: '소고기 20g',
        item_id: null,
        store_category: '정육',
        role: '부재료',
        where: 'category',
        stores: 3,
      },
      {
        text: '소금 약간',
        item_id: null,
        store_category: null,
        role: '부재료',
        where: 'outside',
        stores: 0,
      },
    ],
  };
  vi.mocked(getRecipe).mockResolvedValue(detail);
  render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/recipes/r?market=m']}>
        <Routes>
          <Route path="/recipes/:recipeId" element={<RecipePage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
  await screen.findByRole('heading', { name: fixture.name });
  expect(screen.getByText((_, e) => e?.textContent === fixture.steps)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '이 시장 2곳' })).toHaveAttribute(
    'href',
    '/?market=m&item=item%3Agreen_onion',
  );
  expect(screen.getByRole('link', { name: '정육 점포 3곳' })).toHaveAttribute(
    'href',
    '/?market=m&category=meat',
  );
  expect(screen.getByText('시장 밖 재료')).toBeInTheDocument();
  expect(screen.getByText('식품의약품안전처 조리식품 레시피 DB')).toBeInTheDocument();
});
it('Shop 목록은 품목 없이 시장별 API를 쓴다', async () => {
  render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/shop?market=m']}>
        <Recipes />
      </MemoryRouter>
    </SessionProvider>,
  );
  await screen.findByText(fixture.name);
  expect(getRecipes).toHaveBeenCalledWith({ item_id: undefined, market_id: 'm', limit: 3 });
  expect(screen.getByRole('heading', { name: '레시피로 장보기' })).toBeInTheDocument();
});

it('레시피 재료의 청과·채소 링크가 지도 공통 업종으로 연결된다', () => {
  expect(storeCategory({ category: 'store_category:fruit' })).toBe('produce');
  expect(storeCategory({ category: 'store_category:vegetable' })).toBe('produce');
  expect(storeCategory({ category: 'store_category:meat' })).toBe('meat');
});

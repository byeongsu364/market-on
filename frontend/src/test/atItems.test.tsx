import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SessionProvider } from '../store/SessionProvider';
import { MemoryRouter } from 'react-router-dom';
import { itemImage, ITEM_CATEGORIES } from '../utils/itemImage';
import { unitLabel } from '../utils/convertUnit';
import { ChecklistSection } from '../pages/scan/resultParts';
import Search from '../pages/map/Search';
import * as itemsApi from '../api/items';
import * as marketsApi from '../api/markets';
import type { Item } from '../types/contract';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it('provides six category fallbacks for 95 items and preserves existing art', () => {
  expect(Object.keys(ITEM_CATEGORIES)).toHaveLength(95);
  expect(new Set(Object.values(ITEM_CATEGORIES)).size).toBe(6);
  for (const id of Object.keys(ITEM_CATEGORIES))
    expect(itemImage(id)).toMatch(/^\/items\/.+\.svg$/);
  expect(itemImage('item:apple')).toBe('/items/apple.svg');
  expect(itemImage('item:apple', 'variety:apple-hongro')).toBe('/items/apple-hongro.svg');
  expect(itemImage('item:strawberry')).toBe('/items/vegetable.svg');
  expect(itemImage('item:mackerel')).toBe('/items/seafood.svg');
  expect(unitLabel('unit:g100')).toBe('100g');
  expect(unitLabel('unit:egg10')).toBe('10구');
});

it('shows source quote and pending criteria text', () => {
  const view = render(
    <ChecklistSection
      sourceQuote
      criteria={[{ key: 'p1', text: '원문 문장이다.', source: '공공 원문' }]}
      checked={[]}
      onToggle={() => {}}
    />,
    { wrapper: SessionProvider },
  );
  expect(screen.getByText('원문')).toBeInTheDocument();
  expect(screen.getByText('원문 문장이다.')).toBeInTheDocument();
  view.rerender(<ChecklistSection criteria={[]} checked={[]} onToggle={() => {}} />);
  expect(screen.getByText('이 품목은 확인 포인트 자료를 준비 중이에요')).toBeInTheDocument();
});

it('filters and searches a 95 item catalog beyond the initial page', async () => {
  localStorage.clear();
  const catalog: Item[] = Object.keys(ITEM_CATEGORIES).map((item_id, n) => ({
    item_id,
    name: item_id === 'item:strawberry' ? '딸기' : `품목${n}`,
    synonyms: [],
    vision_labels: [],
    criteria: [],
    default_unit: 'unit:kg',
    units: ['unit:kg'],
    labels_i18n: {},
  }));
  vi.spyOn(itemsApi, 'searchItems').mockResolvedValue(catalog);
  vi.spyOn(marketsApi, 'getMarkets').mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={['/search']}>
      <Search />
    </MemoryRouter>,
    { wrapper: SessionProvider },
  );
  expect(await screen.findByText('품목 더 보기 (95)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '수산물' }));
  expect(screen.getByText('품목 더 보기 (26)')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '딸기' } });
  expect(await screen.findByText('딸기')).toBeInTheDocument();
  expect(screen.queryByText('품목 더 보기 (26)')).not.toBeInTheDocument();
});

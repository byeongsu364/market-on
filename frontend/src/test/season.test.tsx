import { expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as itemsApi from '../api/items';
import { getInSeason } from '../api/mock';

it('mock season contract contains only featured months', async () => {
  expect(await getInSeason(11)).toEqual([
    { item_id: 'item:sweet_persimmon', name: '단감', label: '11월 식재료' },
  ]);
  expect(await getInSeason(1)).toEqual([]);
  expect((await getInSeason(9)).map((i) => i.item_id)).toEqual(['item:apple', 'item:pear']);
});

it('홈은 제철 칩을 결과 화면에 연결하고 빈 달은 숨긴다', async () => {
  const load = vi
    .spyOn(itemsApi, 'getInSeason')
    .mockResolvedValue([{ item_id: 'item:sweet_persimmon', name: '단감', label: '11월 식재료' }]);
  const view = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  const section = await screen.findByRole('region', { name: /월 제철/ });
  expect(within(section).getByRole('link', { name: '단감' })).toHaveAttribute(
    'href',
    '/items/item%3Asweet_persimmon',
  );
  expect(within(section).getByText("농사로 '이달의 식재료' 기준")).toBeInTheDocument();
  view.unmount();
  load.mockResolvedValue([]);
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('region', { name: /월 제철/ })).not.toBeInTheDocument();
  load.mockRestore();
});

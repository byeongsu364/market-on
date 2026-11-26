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

it('시장 시트의 제철 탭은 품목을 지도 검색 결과에 연결하고 빈 달은 숨긴다', async () => {
  const load = vi
    .spyOn(itemsApi, 'getInSeason')
    .mockResolvedValue([{ item_id: 'item:sweet_persimmon', name: '단감', label: '11월 식재료' }]);
  const path = '/?market=market:demo&tab=info';
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  const section = await screen.findByRole('region', { name: /월 제철/ });
  expect(within(section).getByRole('link', { name: /단감/ })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo&item=item%3Asweet_persimmon',
  );
  expect(within(section).getByText(/농사로가 \d+월 식재료로 소개해요/)).toBeInTheDocument();
  view.unmount();
  load.mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('region', { name: /월 제철/ })).not.toBeInTheDocument();
  load.mockRestore();
});

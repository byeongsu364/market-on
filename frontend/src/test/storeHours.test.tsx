import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// 공공데이터 점포는 영업시간이 비어 올 수 있음(경동 108곳 모두). "부터 까지"만 남으면 안 됨
vi.mock('../api/sales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sales')>();
  return {
    ...actual,
    getPublicStore: async (id: string) => {
      const page = await actual.getPublicStore(id);
      return { ...page, store: { ...page.store, hours: { open: '', close: '' } } };
    },
  };
});

it('영업시간이 비어 있으면 영업시간 줄을 보여 주지 않는다', async () => {
  render(
    <MemoryRouter initialEntries={['/s/store:A-05']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText('손님 리뷰');
  expect(screen.queryByText(/부터\s*까지/)).not.toBeInTheDocument();
  expect(screen.queryByText('공공데이터 기준 영업시간이에요')).not.toBeInTheDocument();
});

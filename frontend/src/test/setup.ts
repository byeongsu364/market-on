import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetMock } from '../api/mock/merchant';
import { cleanup } from '@testing-library/react';
vi.stubEnv('VITE_API_MODE', 'mock');
beforeEach(() => {
  resetMock();
  localStorage.clear();
  localStorage.setItem(
    'market-day',
    JSON.stringify(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    ),
  );
  localStorage.setItem(
    'market',
    JSON.stringify({ market_id: 'market:demo', name: '시연 시장', lat: 37.57, lng: 126.99 }),
  );
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn(() => 'blob:sample'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: vi.fn() });
  window.history.replaceState({}, '', '/');
});
afterEach(cleanup);

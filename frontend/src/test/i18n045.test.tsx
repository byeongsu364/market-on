import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ko from '../i18n/locales/ko.json';
import en from '../i18n/locales/en.json';
import zh from '../i18n/locales/zh.json';
import ja from '../i18n/locales/ja.json';
import viLocale from '../i18n/locales/vi.json';
import { SessionProvider } from '../store/SessionProvider';
import TranslationNotice from '../components/domain/TranslationNotice';
import Settings from '../pages/me/Settings';
import { request } from '../api/client';
import { buildCardData } from '../utils/decisionCard';

it('all locale keys and placeholders match Korean, with draft metadata', () => {
  const placeholders = (value: string) => value.match(/\{\w+\}/g)?.sort() ?? [];
  for (const locale of [en, zh, ja, viLocale]) {
    expect(locale._meta).toEqual({ machine_translated: true, reviewed: false });
    expect(
      Object.keys(locale)
        .filter((key) => key !== '_meta')
        .sort(),
    ).toEqual(Object.keys(ko).sort());
    for (const key of Object.keys(ko) as (keyof typeof ko)[])
      expect(placeholders(locale[key]), key).toEqual(placeholders(ko[key]));
  }
});

it('switches language, remembers it and sends Accept-Language', async () => {
  render(
    <MemoryRouter>
      <SessionProvider>
        <Settings />
      </SessionProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('radio', { name: /日本語/ }));
  expect(document.documentElement.lang).toBe('ja');
  expect(localStorage.getItem('language')).toBe('"ja"');
  expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument();
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetch);
  await request('/items/search');
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Accept-Language')).toBe('ja');
  vi.unstubAllGlobals();
});

it('shows machine translation, expands Korean original and explains failure', () => {
  localStorage.setItem('language', '"en"');
  const { rerender } = render(
    <SessionProvider>
      <TranslationNotice lang="en" translated original="한국어 답" />
    </SessionProvider>,
  );
  expect(screen.getByText('Machine translation · View Korean original')).toBeInTheDocument();
  expect(screen.getByText('한국어 답')).toHaveAttribute('lang', 'ko');
  fireEvent.click(screen.getByText('Machine translation · View Korean original'));
  expect(screen.getByText('한국어 답').parentElement).toHaveAttribute('open');
  rerender(
    <SessionProvider>
      <TranslationNotice lang="en" translated={false} original="한국어 답" />
    </SessionProvider>,
  );
  expect(screen.getByText('Translation unavailable. Showing Korean original.')).toBeInTheDocument();
});

it('renders decision card strings in the selected language without changing sources', () => {
  const card = buildCardData({
    lang: 'ja',
    item: {
      item_id: 'item:apple',
      name: 'リンゴ',
      synonyms: [],
      vision_labels: [],
      criteria: [],
      default_unit: 'unit:piece',
      units: [],
      labels_i18n: {},
    },
    market: { market_id: 'm', name: '시장' },
    checked: [],
    value: '',
    unit: 'unit:piece',
    quantity: 1,
    origin: 'https://example.com',
  });
  expect(card.title).toBe('リンゴ');
  expect(card.prices).toEqual(['参考価格の情報なし']);
  expect(card.footer).toBe('鮮度は自分で確認しました');
  // 가격 자리 이름은 많이 낮음·낮음·조금 높음·높음(2026-11-27 요청, 판정 대신 위치)
  expect(card.bandLabels[1]).toBe('低い');
  expect(card.labels.basisTitle).toBe(ja.cardBasisTitle);
});

it('restores account language at login and saves a changed preference', async () => {
  const authApi = await import('../api/auth');
  const { AuthProvider } = await import('../store/AuthProvider');
  const me = vi.spyOn(authApi, 'me').mockResolvedValue({
    user: {
      id: 'test',
      login_id: 'test',
      role: 'customer',
      status: 'approved',
      store: null,
      market: null,
      lang: 'ja',
    },
  });
  const save = vi.spyOn(authApi, 'saveLanguage').mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <SessionProvider>
        <AuthProvider>
          <Settings />
        </AuthProvider>
      </SessionProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '設定' });
  expect(document.documentElement.lang).toBe('ja');
  fireEvent.click(screen.getByRole('radio', { name: /Tiếng Việt/ }));
  expect(document.documentElement.lang).toBe('vi');
  expect(save).toHaveBeenCalledWith('vi');
  me.mockRestore();
  save.mockRestore();
});

import type {
  AuthRequest,
  User,
  PendingMerchant,
  MerchantStore,
  ClosingSale,
  SaleRequest,
  ActiveSale,
} from '../../types/contract';
import { items, stores, markets } from './data';
import { saleEnd, seoulDay } from '../../utils/sale';
const password = 'market-on-demo';
export const demoCredentials = (login_id = 'demo_a05') => ({ login_id, password });
const users: PendingMerchant[] = [
  {
    id: 'admin',
    login_id: 'admin',
    market: null,
    role: 'operator',
    status: 'approved',
    store: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo_a05',
    login_id: 'demo_a05',
    market: null,
    role: 'merchant',
    status: 'approved',
    store: { store_id: 'store:A-05', name: '점포 A-05', market_id: 'market:demo' },
    created_at: new Date().toISOString(),
  },
  {
    id: 'pending_a08',
    login_id: 'pending_a08',
    market: null,
    role: 'merchant',
    status: 'pending',
    store: { store_id: 'store:A-08', name: '점포 A-08', market_id: 'market:demo' },
    created_at: new Date().toISOString(),
  },
];
const initialUsers = structuredClone(users);
const passwords = new Map(users.map((u) => [u.login_id, password]));
let current: User | null = null;
const hours = new Map<string, { open: string; close: string }>();
const views = new Map<string, number>();
const details = new Map<string, Pick<MerchantStore, 'payments' | 'intro'>>();
export const storeDetails = (id: string) => details.get(id) ?? {};
export const sales: ClosingSale[] = [
  {
    id: 1,
    store_id: 'store:A-05',
    item_id: 'item:green_onion',
    sale_price: 2500,
    regular_price: 3000,
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: saleEnd(),
    status: 'active',
    view_count: 0,
  },
];
function session(user: User | null) {
  current = user;
  try {
    if (user) sessionStorage.setItem('mock-auth', user.id);
    else sessionStorage.removeItem('mock-auth');
  } catch {
    /* unavailable */
  }
  return { user };
}
export async function me() {
  try {
    const id = sessionStorage.getItem('mock-auth');
    current = users.find((u) => u.id === id) ?? null;
  } catch {
    /* memory fallback */
  }
  return { user: current };
}
export async function login(q: AuthRequest) {
  const u = users.find((u) => u.login_id === q.login_id);
  if (!u || q.password !== passwords.get(q.login_id))
    throw new Error('아이디와 비밀번호를 확인해 주세요.');
  return session(u);
}
export async function logout() {
  session(null);
}
export async function signup(q: AuthRequest) {
  if (q.role === 'customer') return signupCustomer(q);
  validateSignup(q.login_id, q.password);
  if (users.some((u) => u.store?.store_id === q.store_id && u.status === 'approved'))
    throw new Error('이미 승인된 상인이 있는 점포예요.');
  const s = stores.find((s) => s.store_id === q.store_id);
  if (!s) throw new Error('점포를 골라 주세요.');
  const u: PendingMerchant = {
    id: q.login_id,
    login_id: q.login_id,
    market: null,
    role: 'merchant',
    status: 'pending',
    store: { store_id: s.store_id, name: s.name, market_id: markets[0].market_id },
    created_at: new Date().toISOString(),
  };
  users.push(u);
  passwords.set(u.login_id, q.password);
  return session(u);
}
/** 손님 가입: live와 동일한 역할과 점포 제약을 적용해요. */
export async function signupCustomer(q: AuthRequest) {
  if (q.store_id) throw { status: 422, message: '손님은 점포를 지정할 수 없어요.' };
  validateSignup(q.login_id, q.password);
  const u: PendingMerchant = {
    id: q.login_id,
    login_id: q.login_id,
    market: null,
    role: 'customer',
    status: 'approved',
    store: null,
    created_at: new Date().toISOString(),
  };
  users.push(u);
  passwords.set(u.login_id, q.password);
  return session(u);
}
function merchant() {
  if (current?.role !== 'merchant' || current.status !== 'approved' || !current.store)
    throw new Error('승인된 상인만 쓸 수 있어요.');
  return current.store;
}
export function activeForStore(id: string, item?: string) {
  return activeSales().find((s) => s.store_id === id && (!item || s.item_id === item)) ?? null;
}
export function activeSales(market?: string, item?: string): ActiveSale[] {
  return sales
    .filter(
      (s) =>
        s.status === 'active' &&
        Date.parse(s.starts_at) <= Date.now() &&
        Date.parse(s.ends_at) > Date.now() &&
        (!item || s.item_id === item) &&
        (!market || market === markets[0].market_id),
    )
    .map((s) => ({
      ...s,
      store_name: stores.find((t) => t.store_id === s.store_id)!.name,
      item_name: items.find((i) => i.item_id === s.item_id)!.name,
    }));
}
function info(id: string): MerchantStore {
  const s = stores.find((s) => s.store_id === id);
  if (!s) throw new Error('점포를 찾을 수 없어요.');
  return {
    ...details.get(id),
    store_id: id,
    name: s.name,
    market_id: markets[0].market_id,
    hours: hours.get(id) ?? { open: '09:00', close: '20:00' },
    item_ids: s.sells,
    today_views: views.get(`${seoulDay()}:${id}`) ?? 0,
    sale_views: sales
      .filter(
        (s) => s.store_id === id && s.status === 'active' && Date.parse(s.ends_at) > Date.now(),
      )
      .reduce((n, s) => n + s.view_count, 0),
  };
}
export async function getStore() {
  return info(merchant().store_id);
}
export async function updateStore(
  q: Partial<Pick<MerchantStore, 'hours' | 'item_ids' | 'payments' | 'intro'>>,
) {
  const id = merchant().store_id;
  if (q.intro != null && q.intro.length > 80) throw new Error('소개는 80자 이내로 입력하세요.');
  if (q.payments?.some((p) => !['card', 'cash', 'transfer', 'onnuri'].includes(p)))
    throw new Error('결제 수단을 확인하세요.');
  details.set(id, {
    ...details.get(id),
    ...('intro' in q ? { intro: q.intro } : {}),
    ...(q.payments ? { payments: q.payments } : {}),
  });
  if (q.hours) hours.set(id, q.hours);
  if (q.item_ids) stores.find((s) => s.store_id === id)!.sells = q.item_ids;
  return info(id);
}
export async function getSales(status: 'active' | 'ended') {
  const id = merchant().store_id;
  return sales.filter(
    (s) =>
      s.store_id === id &&
      (status === 'active'
        ? s.status === 'active' && Date.parse(s.ends_at) > Date.now()
        : s.status === 'ended' || Date.parse(s.ends_at) <= Date.now()),
  );
}
export async function createSale(q: SaleRequest) {
  const s = merchant();
  if (
    !info(s.store_id).item_ids.includes(q.item_id) ||
    !Number.isInteger(q.sale_price) ||
    q.sale_price <= 0 ||
    (q.regular_price !== undefined && q.regular_price <= q.sale_price) ||
    !Number.isFinite(Date.parse(q.ends_at)) ||
    Date.parse(q.ends_at) <= Date.now() ||
    Date.parse(q.ends_at) > Date.parse(`${seoulDay()}T23:59:59+09:00`)
  )
    throw new Error('품목·가격·끝나는 시각을 확인해 주세요.');
  const sale: ClosingSale = {
    ...q,
    id: Math.max(...sales.map((s) => s.id)) + 1,
    store_id: s.store_id,
    starts_at: new Date().toISOString(),
    status: 'active',
    view_count: 0,
  };
  sales.push(sale);
  return sale;
}
function own(id: number) {
  const sale = sales.find((s) => s.id === id && s.store_id === merchant().store_id);
  if (!sale) throw new Error('세일을 찾을 수 없어요.');
  return sale;
}
export async function endSale(id: number) {
  own(id).status = 'ended';
  return own(id);
}
export async function repostSale(id: number, ends_at: string) {
  return createSale({ ...own(id), ends_at });
}
export async function poster() {
  const s = merchant();
  return {
    store_name: s.name,
    market_name: markets[0].name,
    url: `${window.location.origin}/s/${s.store_id}`,
  };
}
export function operator() {
  if (current?.role !== 'operator') throw new Error('운영자만 쓸 수 있어요.');
}
export async function pending() {
  operator();
  return users.filter((u) => u.role === 'merchant' && u.status === 'pending');
}
export async function decide(id: string, status: User['status']) {
  operator();
  const u = users.find((u) => u.id === id);
  if (!u) throw new Error('상인을 찾을 수 없어요.');
  if (
    status === 'approved' &&
    users.some(
      (v) => v.id !== id && v.status === 'approved' && v.store?.store_id === u.store?.store_id,
    )
  )
    throw new Error('이미 승인된 점포예요.');
  transitionAccount(u, status);
}
export async function publicStore(id: string) {
  const key = `${seoulDay()}:${id}`;
  views.set(key, (views.get(key) ?? 0) + 1);
  const store = info(id);
  return {
    store,
    source: 'manual' as const,
    items_basis: 'merchant' as const,
    guessed_item_ids: [],
    items: items.filter((i) => store.item_ids.includes(i.item_id)),
    sales: activeSales().filter((s) => s.store_id === id),
  };
}
export async function view(id: number) {
  const s = sales.find((s) => s.id === id);
  if (s) s.view_count++;
}

/** 030 mock(merchant030.ts)이 같은 계정 목록과 지금 로그인을 읽음 */
export const mockUsers = () => users;
export const currentMockUser = () => current;
const resetHooks: (() => void)[] = [];
export const onMockReset = (fn: () => void) => resetHooks.push(fn);

export function resetMock() {
  resetHooks.forEach((fn) => fn());
  current = null;
  confirmations.clear();
  users.splice(0, users.length, ...structuredClone(initialUsers));
  passwords.clear();
  users.forEach((u) => passwords.set(u.login_id, password));
  hours.clear();
  details.clear();
  views.clear();
  sales.splice(1);
  sales[0].status = 'active';
  sales[0].view_count = 0;
  sales[0].ends_at = saleEnd();
  try {
    sessionStorage.removeItem('mock-auth');
  } catch {
    /* unavailable */
  }
}

const confirmations = new Map<string, { price: number; confirmed_at: string; unit: string }>();
export function storePrice(
  id: string,
  item: string,
  unit?: string,
): import('../../types/contract').StorePrice {
  const c = confirmations.get(`${id}:${item}`);
  if (!c || Date.now() - Date.parse(c.confirmed_at) > 7 * 86400000 || (unit && unit !== c.unit))
    return null;
  return {
    price: c.price,
    unit: c.unit,
    source: 'merchant',
    observed_on: null,
    reporters: 0,
    latest_at: c.confirmed_at,
    stale:
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
        new Date(c.confirmed_at),
      ) !== seoulDay(),
    merchant_confirmed: true,
  };
}
function lastConfirmation(id: string, item: string) {
  const c = confirmations.get(`${id}:${item}`);
  return c ? { price: c.price, confirmed_at: c.confirmed_at } : null;
}
export async function getPrices(): Promise<import('../../types/contract').MerchantPriceRow[]> {
  const id = merchant().store_id;
  return items
    .filter((i) => info(id).item_ids.includes(i.item_id))
    .map((i) => ({
      item_id: i.item_id,
      name: i.name,
      unit: i.default_unit,
      customers: null,
      my_confirmation: lastConfirmation(id, i.item_id),
    }));
}
export async function confirmPrice(q: import('../../types/contract').PriceConfirmRequest) {
  const id = merchant().store_id;
  const item = items.find((i) => i.item_id === q.item_id);
  if (
    !item ||
    !info(id).item_ids.includes(q.item_id) ||
    !Number.isInteger(q.price) ||
    q.price < 10 ||
    q.price > 10000000 ||
    (q.unit && !item.units.includes(q.unit))
  )
    throw new Error('품목·가격·단위를 확인하세요.');
  const result = {
    price: q.price,
    confirmed_at: new Date().toISOString(),
    unit: q.unit ?? item.default_unit,
  };
  confirmations.set(`${id}:${q.item_id}`, result);
  return { price: result.price, confirmed_at: result.confirmed_at };
}

export function createPendingManager(login_id: string, password: string, market_id: string) {
  login_id = login_id.toLowerCase();
  validateSignup(login_id, password);
  const market = markets.find((m) => m.market_id === market_id);
  if (!market) throw new Error('시장을 찾을 수 없어요.');
  const user: PendingMerchant = {
    id: login_id,
    login_id,
    role: 'market_admin',
    status: 'pending',
    store: null,
    market: { market_id, name: market.name },
    created_at: new Date().toISOString(),
  };
  users.push(user);
  passwords.set(login_id, password);
  return user.id;
}
export function reviewManager(id: string, status: 'approved' | 'rejected') {
  const user = users.find((u) => u.id === id);
  if (user) transitionAccount(user, status);
}

function validateSignup(login_id: string, password: string) {
  if (!/^[a-z0-9_]{4,20}$/.test(login_id) || password.length < 8 || password.length > 128)
    throw new Error('아이디·비밀번호 규칙을 확인하세요.');
  if (users.some((u) => u.login_id === login_id)) throw new Error('이미 쓰는 아이디예요.');
}

function transitionAccount(user: User, status: User['status']) {
  user.status = status;
}

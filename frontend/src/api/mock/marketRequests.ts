import type { MarketApplication, MarketDemand, JoinRequest } from '../../types/contract';
import { markets, stores } from './data';
import { createPendingManager, reviewManager, operator, mockUsers, dailyViews } from './merchant';
import { getDeviceId } from '../client';
import { seoulDay } from '../../utils/sale';
const records: { market: string; device: string; day: string; kind: 'nearby' | 'request' }[] = [];
const entries: MarketApplication[] = [];
export function record(id: string, kind: 'nearby' | 'request') {
  const day = seoulDay(),
    device = getDeviceId();
  if (
    !records.some((v) => v.market === id && v.device === device && v.day === day && v.kind === kind)
  )
    records.push({ market: id, kind, day, device });
}
export async function search(q: string) {
  return markets.filter((m) => m.name.includes(q.trim())).slice(0, 20);
}
export async function demand(id: string): Promise<MarketDemand> {
  const market = markets.find((m) => m.market_id === id);
  if (!market) throw new Error('시장을 찾을 수 없어요.');
  const cutoff = seoulDay(new Date(Date.now() - 6 * 86400000));
  const count = (kind: 'nearby' | 'request') =>
    new Set(
      records
        .filter((v) => v.market === id && v.kind === kind && v.day >= cutoff && v.day <= seoulDay())
        .map((v) => v.device),
    ).size;
  const nearby = count('nearby'),
    requests = count('request');
  return {
    market_id: id,
    name: market.name,
    status: market.status,
    nearby_7d: nearby < 5 ? null : nearby,
    requests_7d: requests < 5 ? null : requests,
    low: nearby < 5 || requests < 5,
  };
}
export async function requestMarket(id: string) {
  if (markets.find((m) => m.market_id === id)?.status !== 'listed')
    throw new Error('이미 이용할 수 있는 시장이에요.');
  record(id, 'request');
  return { requested: true, requests_7d: (await demand(id)).requests_7d };
}
export async function join(data: JoinRequest) {
  if (markets.find((m) => m.market_id === data.market_id)?.status !== 'listed')
    throw new Error('이미 이용할 수 있는 시장이에요.');
  if (entries.some((v) => v.market_id === data.market_id && v.status === 'pending'))
    throw new Error('이미 확인 중인 신청이 있어요.');
  const uid = createPendingManager(data.login_id, data.password, data.market_id);
  const value: MarketApplication = {
    id: entries.length + 1,
    market_id: data.market_id,
    manager_org: data.manager_org,
    contact: data.contact,
    store_count: data.store_count ?? null,
    note: data.note ?? null,
    admin_user_id: uid,
    status: 'pending',
    created_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    demand: await demand(data.market_id),
  };
  entries.push(value);
  return value;
}
export async function applications() {
  operator();
  return Promise.all(
    entries
      .filter((v) => v.status === 'pending')
      .map(async (v) => ({ ...v, demand: await demand(v.market_id) })),
  );
}
export async function decide(id: number, decision: 'approve' | 'reject') {
  operator();
  const entry = entries.find((v) => v.id === id);
  if (!entry || entry.status !== 'pending') throw new Error('확인할 신청이 없어요.');
  entry.status = decision === 'approve' ? 'approved' : 'rejected';
  entry.reviewed_at = new Date().toISOString();
  entry.reviewed_by = 'admin';
  if (entry.admin_user_id) reviewManager(entry.admin_user_id, entry.status);
  if (decision === 'approve')
    markets.find((m) => m.market_id === entry.market_id)!.status = 'active';
  entry.demand = await demand(entry.market_id);
  return entry;
}

export function resetMarketRequests() {
  records.splice(0);
  entries.splice(0);
}

export async function listedMarkets(): Promise<import('../../types/contract').ListedMarketStats[]> {
  operator();
  const start = seoulDay(new Date(Date.now() - 6 * 86400000));
  return markets
    .filter((m) => m.status === 'listed')
    .map((m) => {
      const requests = records.filter((r) => r.market === m.market_id && r.kind === 'request');
      const application = entries.filter((a) => a.market_id === m.market_id).at(-1);
      return {
        market_id: m.market_id,
        name: m.name,
        requests_week: requests.filter((r) => r.day >= start && r.day <= seoulDay()).length,
        requests_total: requests.length,
        application: application
          ? { status: application.status, created_at: application.created_at }
          : null,
      };
    })
    .sort(
      (a, b) =>
        b.requests_week - a.requests_week ||
        b.requests_total - a.requests_total ||
        a.name.localeCompare(b.name),
    );
}
export async function activeMarkets(): Promise<import('../../types/contract').ActiveMarketStats[]> {
  operator();
  const week = Array.from({ length: 7 }, (_, i) => seoulDay(new Date(Date.now() - i * 86400000)));
  return markets
    .filter((m) => m.status === 'active')
    .map((m) => ({
      market_id: m.market_id,
      name: m.name,
      stores: stores.filter(() => m.market_id === markets[0].market_id).length,
      merchants_approved: mockUsers().filter(
        (u) =>
          u.role === 'merchant' && u.status === 'approved' && u.store?.market_id === m.market_id,
      ).length,
      views_week: stores
        .filter(() => m.market_id === markets[0].market_id)
        .reduce((n, s) => n + week.reduce((sum, d) => sum + dailyViews(s.store_id, d), 0), 0),
    }));
}

import { onMockReset, me } from './merchant';
import { stores } from './data';
import { seoulDay } from '../../utils/sale';
import type { StoreReview, StoreReviews, ReviewWrite } from '../../types/contract';
const records: (StoreReview & { store: string; user: string })[] = [];
const counts = new Map<string, number>();
let sequence = 0;
function store(id: string) {
  if (!stores.some((s) => s.store_id === id))
    throw { status: 404, message: '점포를 찾을 수 없습니다.' };
}
async function customer() {
  const { user } = await me();
  if (!user) throw { status: 401, message: '로그인이 필요합니다.' };
  if (user.role !== 'customer' || user.status !== 'approved')
    throw { status: 403, message: '리뷰는 손님 계정으로 쓸 수 있어요' };
  return user;
}
export async function list(id: string, limit = 20, offset = 0): Promise<StoreReviews> {
  store(id);
  const { user } = await me();
  const all = records
    .filter((r) => r.store === id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
  return {
    average: all.length
      ? Math.round((all.reduce((n, r) => n + r.rating, 0) / all.length) * 10) / 10
      : null,
    count: all.length,
    items: all.slice(offset, offset + limit).map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      author: r.author,
      created_at: r.created_at,
      updated_at: r.updated_at,
      mine: r.user === user?.id,
    })),
  };
}
export async function save(id: string, data: ReviewWrite) {
  const user = await customer();
  store(id);
  if (
    !Number.isInteger(data.rating) ||
    data.rating < 1 ||
    data.rating > 5 ||
    !data.body.trim() ||
    [...data.body].length > 200
  )
    throw { status: 422, message: '별점과 글을 확인하세요.' };
  const normalized = data.body
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  if (
    ['씨발', '시발', '병신', '개새끼', '지랄', '좆'].some((w) => normalized.includes(w)) ||
    /01\d{8,9}/.test(normalized) ||
    /https?\s*:|www\s*\./i.test(data.body.normalize('NFKC'))
  )
    throw { status: 422, code: 'REVIEW_BLOCKED', message: '이 표현은 쓸 수 없어요.' };
  const key = `${user.id}:${seoulDay()}`;
  if ((counts.get(key) ?? 0) >= 10)
    throw {
      status: 429,
      code: 'REVIEW_RATE_LIMIT',
      message: '리뷰는 하루 10회까지 작성·수정할 수 있어요.',
    };
  counts.set(key, (counts.get(key) ?? 0) + 1);
  const old = records.find((r) => r.store === id && r.user === user.id);
  if (old) Object.assign(old, data, { updated_at: new Date().toISOString() });
  else
    records.push({
      ...data,
      id: ++sequence,
      store: id,
      user: user.id,
      author: user.login_id.slice(0, 3) + '***',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mine: true,
    });
  return list(id);
}
export async function remove(id: string) {
  const user = await customer();
  store(id);
  const index = records.findIndex((r) => r.store === id && r.user === user.id);
  if (index >= 0) records.splice(index, 1);
}
export function resetReviews() {
  records.length = 0;
  counts.clear();
  sequence = 0;
}

onMockReset(resetReviews);

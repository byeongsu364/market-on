export type Language = 'ko' | 'en' | 'zh' | 'ja' | 'vi';
export type Market = {
  status: 'listed' | 'active';
  market_id: string;
  name: string;
  distance_m: number | null;
  lat: number;
  lng: number;
};
export type Criterion = {
  key: string;
  text: string;
  source: string;
};
export type Item = {
  item_id: string;
  name: string;
  synonyms: string[];
  vision_labels: string[];
  criteria: Criterion[];
  default_unit: string;
  units: string[];
  labels_i18n: Partial<Record<Language, string>>;
};
export type RecognizeResponse = {
  model: string;
  media_id: string | null;
  price_tag: {
    price: number;
    variety_id: string | null;
    unit_text: string;
    unit: string | null;
    quantity: number | null;
  } | null;
  vision_labels: string[];
  candidates: {
    item_id: string;
    name: string;
    confidence: number;
  }[];
};
export type Stat = {
  price: number;
  count: number;
};
export type VarietyPrice = {
  variety_id: string;
  name: string;
  reference_price: number | null;
  unit: string;
  observed_on: string | null;
  count: number;
  default: boolean;
};
export type Price = {
  variety_id: string | null;
  variety_name: string | null;
  varieties: VarietyPrice[];
  item_id: string;
  unit: string;
  reference_price: number;
  seen_price?: number;
  diff_pct: number | null;
  region: string;
  observed_on: string;
  fallback: 'region_avg' | 'national_avg' | 'last_valid' | null;
  source: string;
  by_market_type?: {
    traditional?: Stat;
    large_retail?: Stat;
  };
  this_market?: {
    price: number;
    name: string;
  };
};
export type PriceRequest = {
  variety_id?: string;
  item_id: string;
  market_id: string;
  unit: string;
  seen_price?: number;
};
export type Zone = {
  id: string;
  name: string;
  x: number;
  y: number;
};
export type Store = {
  source: 'manual' | 'sbiz';
  items_basis: 'merchant' | 'sbiz_guess' | 'mixed';
  guessed_item_ids: string[];
  price: StorePrice;
  store_id: string;
  name: string;
  zone_id: string;
  sells: string[];
  map_x: number;
  map_y: number;
  hours: string;
  highlight: boolean;
  active_sale?: Pick<ActiveSale, 'sale_price' | 'regular_price' | 'ends_at'> | null;
};
export type MarketMap = {
  layout: 'schematic' | 'surveyed';
  source_note: string;
  market_id: string;
  zones: Zone[];
  stores: Store[];
};
export type RecommendRequest = {
  purpose: '집밥' | '선물' | '모임';
  relation?: '가족' | '친구' | '나';
  event?: string;
  budget: number;
  headcount: number;
  market_id: string;
};
export type RecommendItem = {
  item_id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_label: string;
  unit_price: number | null;
  subtotal: number | null;
  reason: string;
  stores: { store_id: string; name: string }[];
  sources: Citation[];
};
export type RecommendResponse = {
  items: RecommendItem[];
  total: number;
  budget: number;
  left: number;
  note: string;
  model: string | null;
};
export type ApiError = {
  code: string;
  message: string;
};

export type User = {
  id: string;
  login_id: string;
  role: 'merchant' | 'operator' | 'market_admin' | 'customer';
  market: { market_id: string; name: string } | null;
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  store: { store_id: string; name: string; market_id: string } | null;
};
export type AuthRequest = {
  role?: 'merchant' | 'customer';
  captcha_id?: string;
  captcha_answer?: string;
  login_id: string;
  password: string;
  store_id?: string;
};
export type SaleRequest = {
  item_id: string;
  sale_price: number;
  regular_price?: number;
  unit_id?: string;
  ends_at: string;
};
export type ClosingSale = SaleRequest & {
  id: number;
  store_id: string;
  starts_at: string;
  status: 'active' | 'ended';
  view_count: number;
};
export type ActiveSale = ClosingSale & { store_name: string; item_name: string };
export type MerchantStore = {
  store_id: string;
  name: string;
  market_id: string;
  hours: { open: string; close: string };
  item_ids: string[];
  today_views: number;
  sale_views: number;
};
export type PosterInfo = { store_name: string; market_name: string; url: string };
export type PendingMerchant = User & { created_at: string };
export type StorePage = {
  source: Store['source'];
  items_basis: Store['items_basis'];
  guessed_item_ids: string[];
  store: MerchantStore;
  items: Item[];
  sales: ActiveSale[];
};

export type PriceReportRequest = {
  item_id: string;
  market_id: string;
  store_id?: string;
  unit?: string;
  quantity?: number;
  price: number;
  method: 'price_tag_photo' | 'manual';
  media_id?: string;
};
export type PriceReportResponse = { id: number; updated: boolean };

export type StorePrice = {
  price: number;
  unit: string;
  source: 'customers' | 'merchant' | 'market_avg';
  observed_on?: string | null;
  reporters: number;
  latest_at: string;
  stale: boolean;
  merchant_confirmed: boolean;
} | null;
export type MerchantPriceRow = {
  item_id: string;
  name: string;
  unit: string;
  customers: StorePrice;
  my_confirmation: { price: number; confirmed_at: string } | null;
};
export type PriceConfirmRequest = { item_id: string; unit?: string; price: number };

export type MarketSummary = {
  market_id: string;
  name: string;
  stores_total: number;
  merchants_approved: number;
  merchants_pending: number;
  views_7d: number;
};
export type MarketMerchant = Pick<User, 'id' | 'login_id' | 'status'> & {
  created_at: string;
  store: { store_id: string; name: string };
};

export type MarketDemand = {
  market_id: string;
  name: string;
  status: 'listed' | 'active';
  nearby_7d: number | null;
  requests_7d: number | null;
  low: boolean;
};
export type JoinRequest = {
  market_id: string;
  manager_org: '상인회' | '관리사무소' | '기타';
  contact: string;
  store_count?: number;
  note?: string;
  login_id: string;
  password: string;
};
export type MarketApplication = {
  id: number;
  market_id: string;
  manager_org: JoinRequest['manager_org'];
  contact: string;
  store_count: number | null;
  note: string | null;
  admin_user_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  demand: MarketDemand;
};

export type AskIntent = 'select' | 'store' | 'prep' | 'season' | 'story' | 'price' | 'where';
export type AskRequest = {
  question?: string;
  intent?: AskIntent;
  item_id?: string;
  market_id?: string;
  lang?: 'ko';
};
export type Citation = {
  draft: boolean;
  title: string;
  publisher: string | null;
  url: string | null;
  license: string | null;
};
export type PriceView = Price;
export type AskResponse = {
  kind: 'answer' | 'no_evidence' | 'need_item' | 'price' | 'where' | 'out_of_scope';
  intent: AskIntent | null;
  item_id: string | null;
  item_name: string | null;
  answer: string | null;
  citations: Citation[];
  candidates?: { item_id: string; name: string }[];
  price?: PriceView;
  stores?: { store_id: string; name: string }[];
  model: string | null;
  cached: boolean;
  removed: number;
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatRequest = { messages: ChatMessage[]; market_id: string; item_id?: string };
export type ChatResponse = {
  reply: string;
  citations: Citation[];
  tools: { name: string; label: string }[];
  items: { item_id: string; name: string }[];
  model: string | null;
  removed: number;
};

export type MarketItem = { item_id: string; name: string; store_count: number };
export type PublicConfig = { naver_map_client_id: string | null };

export type InSeasonItem = { item_id: string; name: string; label: string };

export type StoreReview = {
  id: number;
  rating: number;
  body: string;
  author: string;
  created_at: string;
  updated_at: string;
  mine: boolean;
};
export type StoreReviews = { average: number | null; count: number; items: StoreReview[] };
export type ReviewWrite = { rating: number; body: string };

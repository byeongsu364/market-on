export type Language = 'ko' | 'en' | 'zh' | 'ja' | 'vi';
export type Market = {
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
  media_id: string | null;
  price_tag: {
    price: number;
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
export type Price = {
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
  market_id: string;
  zones: Zone[];
  stores: Store[];
};
export type RecommendRequest = {
  purpose: string;
  relation?: string;
  event?: string;
  budget: number;
  headcount: number;
};
export type RecommendResponse = {
  items: {
    item_id: string;
    name: string;
    reason: string;
    stores: string[];
    sources: string[];
  }[];
};
export type ApiError = {
  code: string;
  message: string;
};

export type User = {
  id: string;
  login_id: string;
  role: 'merchant' | 'operator';
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  store: { store_id: string; name: string; market_id: string } | null;
};
export type AuthRequest = { login_id: string; password: string; store_id?: string };
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
export type StorePage = { store: MerchantStore; items: Item[]; sales: ActiveSale[] };

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
  source: 'customers' | 'merchant';
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

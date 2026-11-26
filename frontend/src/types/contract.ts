export type Language = 'ko' | 'en' | 'zh' | 'ja' | 'vi';
export type Market = {
  status: 'listed' | 'active';
  market_id: string;
  name: string;
  distance_m: number | null;
  lat: number;
  lng: number;
} & MarketExtra;
export type Criterion = {
  key: string;
  text: string;
  source: string;
};
export type Item = {
  criteria_style?: 'source_quote' | null;
  variety_id?: string | null;
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
  variety_id?: string | null;
  variety_text?: string | null;
  model: string;
  media_id: string | null;
  // 손님이 촬영 위치 사용에 동의했을 때만: 1km 안 가장 가까운 시장 ID와 대략 좌표(소수 둘째 자리)
  photo_location?: { market_id: string | null; lat: number; lng: number } | null;
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
  mock?: boolean;
  source?: string | null;
  variety_id: string;
  name: string;
  reference_price: number | null;
  unit: string;
  observed_on: string | null;
  count: number;
  default: boolean;
} & VarietyExtra;
export type Price = {
  mock?: boolean;
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
  /** 030 제안: 서버가 계산한 가격 구간. 없으면 utils/priceBand 가 같은 규칙으로 계산 */
  band?: PriceBand | null;
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
  pending_reporters?: number;
  store_id: string;
  name: string;
  zone_id: string;
  sells: string[];
  map_x: number;
  map_y: number;
  hours: string;
  highlight: boolean;
  active_sale?: Pick<ActiveSale, 'sale_price' | 'regular_price' | 'ends_at'> | null;
} & StoreExtra;
export type MarketMap = {
  layout: 'schematic' | 'surveyed';
  source_note: string;
  market_id: string;
  zones: Zone[];
  stores: Store[];
  /** 030: 시장 경계와 편의시설(없으면 평면도) */
  boundary?: LatLng[];
  facilities?: Facility[];
};
export type RecommendRequest = {
  lang?: Language;
  purpose: '집밥' | '선물' | '모임';
  relation?: '가족' | '친구' | '나';
  event?: string;
  budget: number;
  headcount: number;
  market_id: string;
};
export type RecommendItem = {
  lang?: Language;
  translated?: boolean;
  original?: string | null;
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
  lang?: Language;
  created_at?: string;
  id: string;
  login_id: string;
  role: 'merchant' | 'operator' | 'market_admin' | 'customer';
  market: { market_id: string; name: string } | null;
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  store: { store_id: string; name: string; market_id: string } | null;
};
export type AuthRequest = {
  role?: 'merchant' | 'customer';
  login_id: string;
  password: string;
  store_id?: string;
  captcha_id?: string;
  captcha_answer?: string;
};
export type Captcha = { captcha_id: string; image: string; expires_in: number };
export type SaleRequest = {
  variety_id?: string | null;
  item_id: string;
  sale_price: number;
  regular_price?: number;
  unit_id?: string;
  ends_at: string;
};
export type ClosingSale = SaleRequest & {
  variety_name?: string | null;
  id: number;
  store_id: string;
  starts_at: string;
  status: 'active' | 'ended';
  view_count: number;
};
export type ActiveSale = ClosingSale & { store_name: string; item_name: string };
export type MerchantStore = {
  favorite?: boolean;
  varieties?: Record<string, string[]>;
  payments?: PaymentMethod[];
  intro?: string | null;
  location?: LatLng | null;
  location_confirmed?: boolean;
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
export type PriceReportResponse = { id: number; updated: boolean; held: boolean };

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
  captcha_id?: string;
  captcha_answer?: string;
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

export type AskIntent =
  'select' | 'store' | 'prep' | 'season' | 'story' | 'price' | 'where' | 'recipe';
export type AskRequest = {
  question?: string;
  intent?: AskIntent;
  item_id?: string;
  market_id?: string;
  lang?: Language;
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
  lang?: Language;
  translated?: boolean;
  original?: string | null;
  kind: 'answer' | 'no_evidence' | 'need_item' | 'price' | 'where' | 'recipes' | 'out_of_scope';
  intent: AskIntent | null;
  item_id: string | null;
  item_name: string | null;
  answer: string | null;
  citations: Citation[];
  recipes?: Recipe[];
  candidates?: { item_id: string; name: string }[];
  price?: PriceView;
  stores?: { store_id: string; name: string }[];
  model: string | null;
  cached: boolean;
  removed: number;
  // 040: 서버가 실제로 거친 단계 (search·extract·write·check)
  steps?: string[];
};

// 도우미 메시지는 서버가 준 reply_sig를 sig로 그대로 돌려줘요 (없으면 서버가 그 메시지를 빼요)
export type ChatMessage = { role: 'user' | 'assistant'; content: string; sig?: string };
export type ChatRequest = {
  lang?: Language;
  messages: ChatMessage[];
  market_id: string;
  item_id?: string;
};
export type ChatResponse = {
  lang?: Language;
  translated?: boolean;
  original?: string | null;
  reply: string;
  citations: Citation[];
  tools: { name: string; label: string }[];
  items: { item_id: string; name: string }[];
  model: string | null;
  removed: number;
  reply_sig?: string | null;
  // 040: 서버가 실제로 거친 단계 (plan·tools·write·check)
  steps?: string[];
};

export type MarketItem = { item_id: string; name: string; store_count: number };
export type PublicConfig = { naver_map_client_id: string | null };

export type InSeasonItem = { item_id: string; name: string; label: string };

// ---------------------------------------------------------------------------
// 지시서 030: 백엔드에 아직 없는 필드(모두 선택). mock에서만 채우고, live에서는 비어 있으면 그 기능을 숨김.
// 제안 형태는 docs/tasks/030-api-gaps.md
export type LatLng = { lat: number; lng: number };
export type StoreCategory = 'produce' | 'dried' | 'seafood' | 'side' | 'meat' | 'ricecake';
export type FacilityKind = 'entrance' | 'parking' | 'toilet';
export type Facility = LatLng & { kind: FacilityKind; name: string };
export type MarketExtra = {
  /** 시장 경계(좌표 목록, 닫힌 다각형) */
  boundary?: LatLng[];
  facilities?: Facility[];
  amenities?: { parking: boolean; toilet: boolean; onnuri: boolean } | null;
  address?: string | null;
  store_count?: number;
  /** 준비 중 시장의 요청 수 */
  requests?: number;
};
export type PaymentMethod = 'card' | 'cash' | 'transfer' | 'onnuri';
export type StoreExtra = {
  favorite?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  category?:
    | StoreCategory
    | `store_category:${'produce' | 'fruit' | 'vegetable' | 'dried' | 'seafood' | 'side_dish' | 'meat' | 'snack'}`
    | null;
  naver_name?: string;
  verified?: boolean;
  /** 핀 좌표 출처(2026-11-27): merchant=상인 확인, kakao=카카오맵 장소 검색, null=좌표 없음 */
  location_source?: 'merchant' | 'naver' | 'kakao' | null;
  open_now?: boolean | null;
  intro?: string | null;
  distance_m?: number | null;
  payments?: PaymentMethod[];
  /** 점포가 파는 품종 id */
  varieties?: string[];
  sold_out_item_ids?: string[];
  /** 예시 값: 조회 수, 단골 수 */
  views_today?: number;
  favorites?: number;
};
export type VarietyHarvest = { label: string; from?: string; to?: string };
export type VarietyExtra = {
  mock?: boolean;
  synonyms?: string[];
  description?: string | null;
  description_source?: string | null;
  harvest?: VarietyHarvest | null;
};
export type PriceBand = 1 | 2 | 3 | 4;
export type PriceHistoryPoint = { week_start: string; price: number | null };
export type PriceHistory = {
  item_id: string;
  variety_id: string | null;
  unit: string;
  points: PriceHistoryPoint[];
  source: string;
};
export type Favorite = {
  store_id: string;
  name: string;
  market_id: string;
  notify: boolean;
  active_sale?: { sale_price: number; regular_price: number | null; ends_at: string } | null;
};
export type MultiItemMap = MarketMap & { item_ids: string[] };
/** 위치 확인과 단골 수는 live 지원. 오늘 품절은 mock 전용 선택 값. */
export type MerchantExtras = {
  favorites?: number;
  sold_out_item_ids?: string[];
  location: LatLng | null;
  location_confirmed: boolean;
};

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

export type MerchantStats = {
  today: { views: number; directions: number };
  days: { day: string; views: number; directions: number }[];
  favorites: number;
};
export type MarketAdminStats = {
  stores: number;
  merchants_approved: number;
  merchants_pending: number;
  views_week: number;
  recent: {
    user_id: string;
    login_id: string;
    store_id: string;
    store_name: string;
    last_sale_at: string | null;
    sales_week: number;
  }[];
};
export type ListedMarketStats = {
  market_id: string;
  name: string;
  requests_week: number;
  requests_total: number;
  application: Pick<MarketApplication, 'status' | 'created_at'> | null;
};
export type ActiveMarketStats = {
  market_id: string;
  name: string;
  stores: number;
  merchants_approved: number;
  views_week: number;
};

export type RecipeIngredient = {
  text: string;
  item_id: string | null;
  store_category: string | null;
  role: '주재료' | '부재료';
  where: 'item' | 'category' | 'outside';
  stores: number;
};
export type Recipe = {
  recipe_id: string;
  name: string;
  dish_type: string;
  cook_method: string;
  kcal: string | null;
  main_item_id: string | null;
  reason: string;
  coverage: { total: number; in_market: number; stores: number };
  ingredients: RecipeIngredient[];
  source: Omit<Citation, 'draft'>;
};
export type RecipeDetail = Recipe & { steps: string; ingredient_lines: string[] };

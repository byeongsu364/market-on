import QRCode from 'qrcode';
import type { Item, Market, Price } from '../types/contract';
import { seoulDay } from './sale';
import { unitLabel } from './convertUnit';

export type CardInput = {
  item: Item;
  market: Pick<Market, 'market_id' | 'name'>;
  checked: string[];
  photo?: File;
  price?: Price | null;
  value: string;
  unit: string;
  quantity: number;
  store?: { store_id: string; name: string };
  origin: string;
  now?: Date;
};
export function buildCardData(input: CardInput) {
  const { item, market, price, store } = input;
  const selected = item.criteria.filter((c) => input.checked.includes(c.key));
  const date = seoulDay(input.now);
  const seen = Number(input.value);
  const hasPrice = Number.isFinite(seen) && seen > 0;
  const pct = hasPrice ? price?.diff_pct : null;
  const comparison =
    pct == null
      ? ''
      : pct === 0
        ? '기준시세와 차이가 없어요 · 0%'
        : `${pct < 0 ? '▼ −' : '▲ +'}${Math.abs(pct)}% · 기준시세보다 ${Math.abs(pct)}% ${pct < 0 ? '낮아요' : '높아요'}`;
  const points = (selected.length ? selected : item.criteria).map(
    (c) => `${selected.length ? '✓ ' : ''}${c.text}`,
  );
  const count = selected.length
    ? `${item.criteria.length}개 중 ${selected.length}개 확인`
    : `확인 포인트 ${item.criteria.length}개`;
  const prices = [
    ...(hasPrice
      ? [
          // "5,000원 / 3개 (1개 1,667원)" — "3 × 1개"처럼 읽히지 않게
          input.quantity > 1
            ? `현장 가격 ${seen.toLocaleString('ko-KR')}원 / ${input.quantity}${unitLabel(input.unit).replace(/^1/, '')} (${unitLabel(input.unit)} ${Math.round(seen / input.quantity).toLocaleString('ko-KR')}원)`
            : `현장 가격 ${seen.toLocaleString('ko-KR')}원 / ${unitLabel(input.unit)}`,
        ]
      : []),
    ...(price
      ? [`기준시세 ${price.reference_price.toLocaleString('ko-KR')}원 / ${unitLabel(price.unit)}`]
      : ['기준시세 정보 없음']),
    ...(comparison ? [comparison] : []),
  ];
  const sources = [
    ...(price
      ? [
          // price.source에 조사일이 이미 있으면 다시 붙이지 않음 (실제 응답은 "… · 2026-11-25 조사" 포함)
          `${price.source}${price.observed_on && !price.source.includes(price.observed_on) ? ` · ${price.observed_on} 조사` : ''} · ${price.region}${price.fallback ? ` · ${{ region_avg: '같은 지역 전체 평균', national_avg: '전국 평균', last_valid: '최근 조사값' }[price.fallback]}` : ''}`,
        ]
      : []),
    ...new Set(item.criteria.map((c) => c.source)),
  ];
  const footer = 'Market-On은 판정하지 않아요 · 확인은 직접 했어요';
  const title = [item.name, price?.variety_name].filter(Boolean).join(' · ');
  return {
    date,
    title,
    market: market.name,
    photo: input.photo,
    points,
    count,
    prices,
    sources,
    footer,
    store: store?.name ?? market.name,
    url: new URL(
      store
        ? `/s/${encodeURIComponent(store.store_id)}`
        : `/?market=${encodeURIComponent(market.market_id)}`,
      input.origin,
    ).href,
    filename: `market-on-${item.name.replace(/[\\/:*?"<>|]/g, '_')}-${date}.png`,
    alt: [
      market.name,
      date,
      title,
      '내가 확인한 것',
      count,
      ...points,
      ...prices,
      store?.name,
      ...sources,
      footer,
    ]
      .filter(Boolean)
      .join('. '),
  };
}
export type CardData = ReturnType<typeof buildCardData>;

export function wrapText(
  text: string,
  measure: (value: string) => number,
  width: number,
  maxLines: number,
): string[] {
  if (maxLines <= 0) return [];
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (char === '\n' || (line && measure(line + char) > width)) {
      lines.push(line);
      line = '';
    }
    if (char !== '\n') line += char;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const result = lines.slice(0, maxLines);
  let last = result[maxLines - 1];
  while (last && measure(last + '…') > width) last = last.slice(0, -1);
  result[maxLines - 1] = last + '…';
  return result;
}

export async function drawCard(canvas: HTMLCanvasElement, data: CardData): Promise<Blob> {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('700 48px "Wanted Sans Variable"', data.title + 'Market-On'),
    document.fonts.load('500 28px "SUIT Variable"', data.alt),
  ]);
  // A scoped light element resolves semantic tokens without changing the app theme.
  const palette = document.createElement('div');
  palette.dataset.theme = 'light';
  document.body.append(palette);
  const style = getComputedStyle(palette);
  const colors = Object.fromEntries(
    ['bg', 'card', 'text', 'photo-placeholder'].map((key) => [
      key === 'photo-placeholder' ? 'placeholder' : key,
      style.getPropertyValue(`--color-${key}`).trim(),
    ]),
  );
  palette.remove();
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, 1080, 1350);
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    width: number,
    lines = 1,
    heading = false,
  ) => {
    ctx.fillStyle = colors.text;
    ctx.font = `${heading ? 700 : 500} ${size}px "${heading ? 'Wanted Sans Variable' : 'SUIT Variable'}", sans-serif`;
    wrapText(value, (s) => ctx.measureText(s).width, width, lines).forEach((s, i) =>
      ctx.fillText(s, x, y + i * size * 1.35),
    );
  };
  text('Market-On', 48, 65, 42, 450, 1, true);
  text(data.market, 500, 60, 24, 340);
  text(data.date, 860, 60, 24, 172);
  ctx.fillStyle = colors.placeholder;
  ctx.fillRect(48, 104, 440, 440);
  if (data.photo) {
    const url = URL.createObjectURL(data.photo);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Photo unavailable'));
        img.src = url;
      });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        48,
        104,
        440,
        440,
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  } else text(data.title, 76, 290, 48, 384, 3, true);
  text(data.title, 528, 175, 48, 504, 3, true);
  text('내가 확인한 것', 48, 608, 36, 984, 1, true);
  text(data.count, 48, 653, 27, 984);
  const pointSize = data.points.length > 4 ? 24 : 28;
  const pointHeight = Math.min(64, 170 / Math.max(1, data.points.length));
  data.points.forEach((point, i) =>
    text(point, 48, 700 + i * pointHeight, pointSize, 984, pointHeight >= 64 ? 2 : 1),
  );
  // 사진 오른쪽 빈자리에 가격 (제목 아래)
  data.prices.forEach((price, i) => text(price, 528, 300 + i * 92, 28, 504, 2));
  text(data.store, 48, 1080, 34, 750, 2, true);
  const qr = QRCode.create(data.url, { errorCorrectionLevel: 'M' }).modules;
  const cell = 180 / (qr.size + 8);
  ctx.fillStyle = colors.card;
  ctx.fillRect(852, 984, 180, 180);
  ctx.fillStyle = colors.text;
  for (let row = 0; row < qr.size; row++)
    for (let col = 0; col < qr.size; col++)
      if (qr.get(row, col))
        ctx.fillRect(852 + (col + 4) * cell, 984 + (row + 4) * cell, cell + 0.2, cell + 0.2);
  text(data.sources.join(' · '), 48, 1198, 23, 984, 3);
  text(data.footer, 48, 1310, 26, 984);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))),
      'image/png',
    ),
  );
}

import QRCode from 'qrcode';
import { t as translate, type Key } from '../i18n';
import type { Language } from '../types/contract';
import type { Item, Market, Price } from '../types/contract';
import { seoulDay } from './sale';
import { unitLabel } from './convertUnit';
import { priceBand } from './priceBand';

export type CardInput = {
  lang?: Language;
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
  const lang = input.lang ?? 'ko';
  const t = (key: Key) => translate(key, lang);
  const bandLabels = [t('cardBand1'), t('cardBand2'), t('cardBand3'), t('cardBand4')];
  const selected = item.criteria.filter((c) => input.checked.includes(c.key));
  const date = seoulDay(input.now);
  const seen = Number(input.value);
  const hasPrice = Number.isFinite(seen) && seen > 0;
  const pct = hasPrice ? price?.diff_pct : null;
  const comparison =
    pct == null
      ? ''
      : pct === 0
        ? t('cardEqual')
        : `${pct < 0 ? '▼ −' : '▲ +'}${Math.abs(pct)}% · ${t(pct < 0 ? 'cardLower' : 'cardHigher').replace('{pct}', String(Math.abs(pct)))}`;
  const points = (selected.length ? selected : item.criteria).map(
    (c) => `${selected.length ? '✓ ' : ''}${c.text}`,
  );
  const count = selected.length
    ? t('cardChecked')
        .replace('{total}', String(item.criteria.length))
        .replace('{done}', String(selected.length))
    : t('cardPoints').replace('{total}', String(item.criteria.length));
  const prices = [
    ...(hasPrice
      ? [
          // "5,000원 / 3개 (1개 1,667원)" — "3 × 1개"처럼 읽히지 않게
          input.quantity > 1
            ? `${t('cardPriceLine')
                .replace('{price}', seen.toLocaleString('ko-KR'))
                .replace(
                  '{unit}',
                  String(input.quantity) + unitLabel(input.unit).replace(/^1/, ''),
                )} (${unitLabel(input.unit)} ${Math.round(seen / input.quantity).toLocaleString('ko-KR')}원)`
            : t('cardPriceLine')
                .replace('{price}', seen.toLocaleString('ko-KR'))
                .replace('{unit}', unitLabel(input.unit)),
        ]
      : []),
    ...(price
      ? [
          t('cardReferenceLine')
            .replace(
              '{price}',
              `${price.mock ? t('sample') + ' ' : ''}${price.reference_price.toLocaleString('ko-KR')}`,
            )
            .replace('{unit}', unitLabel(price.unit)),
        ]
      : [t('cardNoPrice')]),
    ...(comparison ? [comparison] : []),
  ];
  const sources = [
    ...(price
      ? [
          // price.source에 조사일이 이미 있으면 다시 붙이지 않음 (실제 응답은 "… · 2026-11-25 조사" 포함)
          `${price.source}${!price.mock && price.observed_on && !price.source.includes(price.observed_on) ? ` · ${price.observed_on} 조사` : ''} · ${price.region}${price.fallback ? ` · ${{ region_avg: '같은 지역 전체 평균', national_avg: '전국 평균', last_valid: '최근 조사값' }[price.fallback]}` : ''}`,
        ]
      : []),
    ...new Set(item.criteria.map((c) => c.source)),
  ];
  // 가격 구간: 결과 화면과 같은 규칙(utils/priceBand). 가격을 넣지 않았으면 눈금을 모두 끄고 문구를 비움
  const verdict = hasPrice && price ? priceBand(price, price.variety_id) : null;
  const band = verdict?.band ?? null;
  const bandLine = verdict
    ? verdict.band
      ? t(`cardMessage${verdict.band}` as Key)
      : t('cardCompareNote')
    : '';
  // 신선도에는 결론을 붙이지 않고 손님이 한 확인만 적음(기획서 "팀 원칙과 맞추기")
  const footer = t('cardFooter');
  const title = [item.name, price?.variety_name].filter(Boolean).join(' · ');
  return {
    lang,
    compareNote: t('cardCompareNote'),
    date,
    title,
    market: market.name,
    photo: input.photo,
    points,
    count,
    prices,
    sources,
    footer,
    band,
    bandLabels,
    bandLine,
    bandNote: verdict?.fallbackNote ?? null,
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
      t('cardMyChecks'),
      count,
      ...points,
      ...prices,
      band ? `${lang === 'ko' ? '가격 자리 ' : ''}${bandLabels[band - 1]}` : '',
      bandLine,
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

const FONT =
  '"Pretendard Variable", Pretendard, system-ui, "PingFang SC", "Hiragino Sans", "Yu Gothic", "Microsoft YaHei", sans-serif';

/** 판단 카드 PNG(1080×1760). 어두운 면(surface-dark) 위에 시안 Card의 배치를 그대로 옮김 */
export async function drawCard(canvas: HTMLCanvasElement, data: CardData): Promise<Blob> {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load(`700 48px ${FONT}`, data.title + 'Market-On'),
    document.fonts.load(`400 28px ${FONT}`, data.alt),
  ]);
  // 앱 테마와 상관없이 밝은 테마의 토큰 값을 읽음(카드는 늘 같은 모습)
  const palette = document.createElement('div');
  palette.dataset.theme = 'light';
  document.body.append(palette);
  const style = getComputedStyle(palette);
  const token = (name: string) => style.getPropertyValue(`--color-${name}`).trim();
  const colors = {
    bg: token('surface-dark'),
    text: token('on-dark'),
    soft: token('on-dark-soft'),
    on: token('signal-dark'),
    diff: token('signal-text-dark'),
    off: token('gauge-off-dark'),
    photo: token('photo-placeholder'),
    qrBg: token('surface-card'),
    qr: token('ink'),
  };
  palette.remove();
  const W = 1080;
  const H = 1760;
  const P = 60;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    width: number,
    { lines = 1, weight = 400, color = colors.text, align = 'left' as CanvasTextAlign } = {},
  ) => {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.font = `${weight} ${size}px ${FONT}`;
    const rows = wrapText(value, (s) => ctx.measureText(s).width, width, lines);
    rows.forEach((s, i) => ctx.fillText(s, x, y + i * size * 1.35));
    ctx.textAlign = 'left';
    return rows.length * size * 1.35;
  };
  const round = (x: number, y: number, w: number, h: number, r: number[]) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  // 머리: 로고 글자, 시장과 날짜
  text('Market-On', P, 92, 52, 400, { weight: 700 });
  text(`${data.market}, ${data.date}`, W - P, 88, 32, 560, { color: colors.soft, align: 'right' });
  // 사진(없으면 빈 면)
  const photoY = 140;
  const photoH = 380;
  ctx.fillStyle = colors.photo;
  round(P, photoY, W - P * 2, photoH, [40]);
  if (data.photo) {
    const url = URL.createObjectURL(data.photo);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Photo unavailable'));
        img.src = url;
      });
      const boxW = W - P * 2;
      const scale = Math.max(boxW / img.naturalWidth, photoH / img.naturalHeight);
      const sw = boxW / scale;
      const sh = photoH / scale;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(P, photoY, boxW, photoH, [40]);
      ctx.clip();
      ctx.drawImage(
        img,
        (img.naturalWidth - sw) / 2,
        (img.naturalHeight - sh) / 2,
        sw,
        sh,
        P,
        photoY,
        boxW,
        photoH,
      );
      ctx.restore();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  // 품목, 가격 줄
  let y = photoY + photoH + 70;
  text(data.title, P, y, 38, W - P * 2, { weight: 500, color: colors.soft });
  y += 20;
  data.prices.forEach((line, i) => {
    y += i === 0 ? 64 : 48;
    text(line, P, y, i === 0 ? 48 : 32, W - P * 2, {
      weight: i === 0 ? 700 : 400,
      color:
        i === 0
          ? colors.text
          : line.startsWith('▼') || line.startsWith('▲')
            ? colors.diff
            : colors.soft,
    });
  });
  // 가격 눈금: 4px 막대 아래 네 칸, 켜진 칸만 주황(signal-dark)
  y += 50;
  const gap = 12;
  const cellW = (W - P * 2 - gap * 3) / 4;
  ctx.fillStyle = colors.text;
  round(P, y, W - P * 2, 12, [6]);
  data.bandLabels.forEach((label, i) => {
    const on = data.band === i + 1;
    ctx.fillStyle = on ? colors.on : colors.off;
    const x = P + i * (cellW + gap);
    round(x, y + 12, cellW, 78, [0, 0, 39, 39]);
    text(label, x + cellW / 2, y + 140, 26, cellW, {
      lines: 2,
      weight: on ? 600 : 400,
      color: on ? colors.text : colors.soft,
      align: 'center',
    });
  });
  y += 210;
  text(data.bandLine || data.compareNote, P, y, 56, W - P * 2, { weight: 600 });
  if (data.bandNote) {
    y += 52;
    text(data.bandNote, P, y, 30, W - P * 2, { color: colors.soft });
  }
  // 내가 확인한 것(체크한 것만 ✓)
  y += 50;
  ctx.fillStyle = colors.off;
  ctx.fillRect(P, y, W - P * 2, 3);
  y += 20;
  data.points.slice(0, 4).forEach((point) => {
    y += 52;
    text(point, P, y, 34, 700, { lines: 1 });
  });
  y += 56;
  text(`${data.count}. ${data.footer}.`, P, y, 30, 700, { lines: 2, color: colors.soft });
  // 아래: 점포, 출처, QR
  const qrSize = 200;
  const qrY = H - P - qrSize;
  text(data.store, P, qrY + 40, 38, W - P * 3 - qrSize, { lines: 1, weight: 600 });
  text(data.sources.join(' · '), P, qrY + 96, 24, W - P * 3 - qrSize, {
    lines: 4,
    color: colors.soft,
  });
  const qr = QRCode.create(data.url, { errorCorrectionLevel: 'M' }).modules;
  const cell = qrSize / (qr.size + 8);
  const qrX = W - P - qrSize;
  ctx.fillStyle = colors.qrBg;
  round(qrX, qrY, qrSize, qrSize, [16]);
  ctx.fillStyle = colors.qr;
  for (let row = 0; row < qr.size; row++)
    for (let col = 0; col < qr.size; col++)
      if (qr.get(row, col))
        ctx.fillRect(qrX + (col + 4) * cell, qrY + (row + 4) * cell, cell + 0.2, cell + 0.2);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))),
      'image/png',
    ),
  );
}

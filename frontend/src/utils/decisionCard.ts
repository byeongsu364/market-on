import type { Item, Market, Price } from '../types/contract';
import { seoulDay } from './sale';
import { unitLabel } from './convertUnit';
import { BAND_LABELS, priceBand } from './priceBand';

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
  // 가격 구간: 결과 화면과 같은 규칙(utils/priceBand). 가격을 넣지 않았으면 눈금을 모두 끄고 문구를 비움
  const verdict = hasPrice && price ? priceBand(price, price.variety_id) : null;
  const band = verdict?.band ?? null;
  const bandLine = verdict ? verdict.message : '';
  // 신선도에는 결론을 붙이지 않고 손님이 한 확인만 적음(기획서 "팀 원칙과 맞추기")
  const footer = '신선도는 직접 확인했어요';
  const title = [item.name, price?.variety_name].filter(Boolean).join(' · ');
  // 2026-11-27 시안(판단 카드): 위 가격 두 줄 + 비교 칩, "비교 근거 4가지", 내가 확인한 것(체크한 것만)
  const seenLine = hasPrice
    ? {
        label: '현장 가격',
        value: `${seen.toLocaleString('ko-KR')}원`,
        unit:
          input.quantity > 1
            ? `${input.quantity}${unitLabel(input.unit).replace(/^1/, '')}`
            : unitLabel(input.unit),
      }
    : null;
  const refLine = price
    ? {
        label: '기준시세',
        value: `${price.reference_price.toLocaleString('ko-KR')}원`,
        unit: unitLabel(price.unit),
      }
    : null;
  const chip =
    pct == null
      ? ''
      : pct === 0
        ? '기준시세와 같아요'
        : `${pct < 0 ? '▼' : '▲'} ${Math.abs(pct)}% · 기준시세보다 ${pct < 0 ? '낮아요' : '높아요'}`;
  const basis = [
    {
      label: '가격',
      value:
        pct == null
          ? hasPrice
            ? '기준시세 없음'
            : '가격 없이 확인'
          : pct === 0
            ? '시세와 같음'
            : `시세보다 ${Math.abs(pct)}% ${pct < 0 ? '낮음' : '높음'}`,
    },
    { label: '품종', value: price?.variety_name ?? '품종 미확인' },
    // 제철은 카드를 그릴 때 이달의 식재료 응답으로 채움(DecisionCardSheet)
    { label: '제철', value: '' },
    {
      label: '상태',
      value: selected.length
        ? `${item.criteria.length}개 중 ${selected.length}개 확인`
        : '확인 안 함',
    },
  ];
  const checkedPoints = selected.map((c) => `✓ ${c.text}`);
  const disclaimer = 'Market-On은 판정하지 않아요 · 확인은 직접 했어요';
  return {
    itemId: item.item_id,
    itemName: item.name,
    seenLine,
    refLine,
    chip,
    basis,
    checkedPoints,
    disclaimer,
    /** 이달의 식재료 문구(예: "11월 식재료"). null이면 이번 달 제철이 아님, undefined면 모름 */
    season: undefined as string | null | undefined,
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
    bandLabels: [...BAND_LABELS],
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
      '내가 확인한 것',
      count,
      ...points,
      ...prices,
      band ? `가격 자리 ${BAND_LABELS[band - 1]}` : '',
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

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';

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
    bg: token('canvas-soft'),
    card: token('surface-card'),
    line: token('hairline-strong'),
    text: token('ink'),
    soft: token('body'),
    muted: token('muted'),
    chipBg: token('signal-soft'),
    chip: token('signal-text'),
    photo: token('photo-placeholder'),
    tag: token('surface-dark'),
    onTag: token('on-dark'),
  };
  palette.remove();
  // 2026-11-27 판단 카드 시안 배치: 머리(로고·시장·날짜) → 사진 + 품목·가격·비교 칩 → 비교 근거 4가지 → 내가 확인한 것 → 출처
  const W = 1080;
  const P = 64;
  const H = 1480;
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
    const rows = wrapText(value, (v) => ctx.measureText(v).width, width, lines);
    rows.forEach((v, i) => ctx.fillText(v, x, y + i * size * 1.35));
    ctx.textAlign = 'left';
    return rows.length * size * 1.35;
  };
  const measure = (value: string, size: number, weight = 400) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return ctx.measureText(value).width;
  };
  const round = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number | number[],
    fill: string,
  ) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  const outline = (x: number, y: number, w: number, h: number, r: number) => {
    round(x, y, w, h, r, colors.card);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, r);
    ctx.stroke();
  };

  // 머리: 로고 글자 · 시장 · 날짜
  text('Market-On', P, 104, 44, 360, { weight: 700 });
  text(data.market, W / 2 + 40, 100, 32, 320, { color: colors.soft, align: 'center' });
  text(data.date, W - P, 100, 32, 300, { color: colors.soft, align: 'right' });

  // 사진(정사각, 없으면 빈 면) + "찍은 사진" 꼬리표
  const photoY = 150;
  const photoS = 400;
  round(P, photoY, photoS, photoS, 32, colors.photo);
  if (data.photo) {
    const url = URL.createObjectURL(data.photo);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Photo unavailable'));
        img.src = url;
      });
      const scale = Math.max(photoS / img.naturalWidth, photoS / img.naturalHeight);
      const sw = photoS / scale;
      const sh = photoS / scale;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(P, photoY, photoS, photoS, 32);
      ctx.clip();
      ctx.drawImage(
        img,
        (img.naturalWidth - sw) / 2,
        (img.naturalHeight - sh) / 2,
        sw,
        sh,
        P,
        photoY,
        photoS,
        photoS,
      );
      ctx.restore();
    } finally {
      URL.revokeObjectURL(url);
    }
    const tag = '찍은 사진';
    const tw = measure(tag, 28, 600) + 36;
    round(P + 20, photoY + photoS - 72, tw, 52, 26, colors.tag);
    text(tag, P + 20 + tw / 2, photoY + photoS - 36, 28, tw, {
      weight: 600,
      color: colors.onTag,
      align: 'center',
    });
  }

  // 오른쪽: 품목 · 품종, 현장 가격, 기준시세, 비교 칩
  const rx = P + photoS + 44;
  const rw = W - P - rx;
  text(data.title, rx, photoY + 60, 52, rw, { weight: 700, lines: 2 });
  let ry = photoY + 150;
  const priceRow = (row: { label: string; value: string; unit: string }) => {
    const lw = measure(row.label + ' ', 32);
    text(row.label, rx, ry, 32, rw, { color: colors.soft });
    const vw = measure(row.value, 44, 700);
    text(row.value, rx + lw, ry, 44, rw - lw, { weight: 700 });
    text(` / ${row.unit}`, rx + lw + vw, ry, 32, rw - lw - vw, { color: colors.soft });
    ry += 70;
  };
  if (data.seenLine) priceRow(data.seenLine);
  if (data.refLine) priceRow(data.refLine);
  else {
    text('기준시세 정보 없음', rx, ry, 32, rw, { color: colors.soft });
    ry += 70;
  }
  if (data.chip) {
    const cw = Math.min(rw, measure(data.chip, 32, 600) + 48);
    round(rx, ry - 20, cw, 72, 20, colors.chipBg);
    text(data.chip, rx + 24, ry + 26, 32, cw - 48, { weight: 600, color: colors.chip });
  }

  // 비교 근거 4가지(2×2)
  let y = photoY + photoS + 96;
  text('비교 근거 4가지', P, y, 40, W - P * 2, { weight: 700 });
  y += 36;
  const gap = 24;
  const tileW = (W - P * 2 - gap) / 2;
  const tileH = 136;
  const season =
    data.season === undefined
      ? '제철 정보 없음'
      : data.season === null
        ? '이번 달 제철 아님'
        : `지금 제철 (${data.season})`;
  data.basis.forEach((b, i) => {
    const x = P + (i % 2) * (tileW + gap);
    const ty = y + Math.floor(i / 2) * (tileH + gap);
    outline(x, ty, tileW, tileH, 24);
    text(b.label, x + 32, ty + 52, 28, tileW - 64, { weight: 600, color: colors.muted });
    text(b.label === '제철' ? season : b.value, x + 32, ty + 102, 34, tileW - 64, {
      weight: 700,
    });
  });
  y += tileH * 2 + gap + 90;

  // 내가 확인한 것(체크한 것만 ✓)
  const head = '내가 확인한 것';
  text(head, P, y, 40, 500, { weight: 700 });
  text(data.count, P + measure(head, 40, 700) + 20, y, 30, 500, { color: colors.soft });
  const lines = data.checkedPoints.length ? data.checkedPoints : ['체크한 확인 포인트가 없어요'];
  lines.slice(0, 4).forEach((point) => {
    y += 58;
    text(point, P, y, 34, W - P * 2, {
      color: data.checkedPoints.length ? colors.text : colors.soft,
    });
  });

  // 출처와 판정하지 않는다는 말
  y += 84;
  y += text(data.sources[0] ?? '', P, y, 26, W - P * 2, { lines: 2, color: colors.soft });
  text(data.disclaimer, P, y + 6, 26, W - P * 2, { color: colors.soft });

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))),
      'image/png',
    ),
  );
}

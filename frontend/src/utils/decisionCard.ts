import { t as translate, type Key } from '../i18n';
import type { Item, Language, Market, Price } from '../types/contract';
import { seoulDay } from './sale';
import { unitLabel } from './convertUnit';
import { priceBand } from './priceBand';

export type CardInput = {
  /** 카드 글자의 언어(045). 품목 이름·출처는 서버가 준 그대로 */
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
  const pctText = (key: Key, value: number) => t(key).replace('{pct}', String(Math.abs(value)));
  // 가격 자리 이름은 요청대로 많이 낮음·낮음·조금 높음·높음(판정 대신 위치만, 2026-11-27)
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
        : `${pct < 0 ? '▼ −' : '▲ +'}${Math.abs(pct)}% · ${pctText(pct < 0 ? 'cardLower' : 'cardHigher', pct)}`;
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
                  `${input.quantity}${unitLabel(input.unit).replace(/^1/, '')}`,
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
              `${price.mock ? `${t('sample')} ` : ''}${price.reference_price.toLocaleString('ko-KR')}`,
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
  // 판정 문구 없이 차이(%)만(요청 2026-11-27)
  const diff = verdict?.diff;
  const bandLine = !verdict
    ? ''
    : !verdict.band || diff == null
      ? t('cardCompareNote')
      : diff === 0
        ? t('cardChipEqual')
        : pctText(diff < 0 ? 'cardLower' : 'cardHigher', diff);
  // 신선도에는 결론을 붙이지 않고 손님이 한 확인만 적음(기획서 "팀 원칙과 맞추기")
  const footer = t('cardFooter');
  const title = [item.name, price?.variety_name !== item.name ? price?.variety_name : null]
    .filter(Boolean)
    .join(' · ');
  // 2026-11-27 시안(판단 카드): 위 가격 두 줄 + 비교 칩, "비교 근거 4가지", 내가 확인한 것(체크한 것만)
  const seenLine = hasPrice
    ? {
        label: t('cardSeenLabel'),
        value: `${seen.toLocaleString('ko-KR')}원`,
        unit:
          input.quantity > 1
            ? `${input.quantity}${unitLabel(input.unit).replace(/^1/, '')}`
            : unitLabel(input.unit),
      }
    : null;
  const refLine = price
    ? {
        // 046: 예시 품종 시세(실제 조사값 아님)면 그렇게 적음
        label: t(price.mock ? 'cardRefSampleLabel' : 'cardRefLabel'),
        value: `${price.reference_price.toLocaleString('ko-KR')}원`,
        unit: unitLabel(price.unit),
      }
    : null;
  const chip =
    pct == null
      ? ''
      : pct === 0
        ? t('cardChipEqual')
        : `${pct < 0 ? '▼' : '▲'} ${Math.abs(pct)}% · ${t(pct < 0 ? 'cardChipLower' : 'cardChipHigher')}`;
  const basis = [
    {
      key: 'price',
      label: t('cardBasisPrice'),
      value:
        pct == null
          ? t(hasPrice ? 'cardNoReference' : 'cardNoPriceChecked')
          : pct === 0
            ? t('cardSameAsRef')
            : pctText(pct < 0 ? 'cardPctLower' : 'cardPctHigher', pct),
    },
    {
      key: 'variety',
      label: t('cardBasisVariety'),
      value: price?.variety_name ?? t('cardNoVariety'),
    },
    // 제철은 카드를 그릴 때 이달의 식재료 응답으로 채움(DecisionCardSheet)
    { key: 'season', label: t('cardBasisSeason'), value: '' },
    {
      key: 'state',
      label: t('cardBasisState'),
      value: selected.length
        ? t('cardChecked')
            .replace('{total}', String(item.criteria.length))
            .replace('{done}', String(selected.length))
        : t('cardNotChecked'),
    },
  ];
  const checkedPoints = selected.map((c) => `✓ ${c.text}`);
  const disclaimer = t('cardDisclaimer');
  // 그림 안의 고정 글(언어별)
  const labels = {
    photoTag: t('cardPhotoTag'),
    noPrice: t('cardNoPrice'),
    basisTitle: t('cardBasisTitle'),
    seasonUnknown: t('cardSeasonUnknown'),
    seasonNo: t('cardSeasonNo'),
    seasonNow: t('cardSeasonNow'),
    myChecks: t('cardMyChecks'),
    noChecks: t('cardNoChecks'),
  };
  return {
    itemId: item.item_id,
    itemName: item.name,
    seenLine,
    refLine,
    chip,
    basis,
    checkedPoints,
    disclaimer,
    labels,
    lang,
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
    const tag = data.labels.photoTag;
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
  // 이름이 두 줄이 되면 가격 줄을 그만큼 내림(겹치던 것, 2026-11-27)
  const titleH = text(data.title, rx, photoY + 60, 52, rw, { weight: 700, lines: 2 });
  let ry = photoY + 60 + titleH + 26;
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
    text(data.labels.noPrice, rx, ry, 32, rw, { color: colors.soft });
    ry += 70;
  }
  if (data.chip) {
    const cw = Math.min(rw, measure(data.chip, 32, 600) + 48);
    round(rx, ry - 20, cw, 72, 20, colors.chipBg);
    text(data.chip, rx + 24, ry + 26, 32, cw - 48, { weight: 600, color: colors.chip });
  }

  // 비교 근거 4가지(2×2)
  let y = photoY + photoS + 96;
  text(data.labels.basisTitle, P, y, 40, W - P * 2, { weight: 700 });
  y += 36;
  const gap = 24;
  const tileW = (W - P * 2 - gap) / 2;
  const tileH = 136;
  const season =
    data.season === undefined
      ? data.labels.seasonUnknown
      : data.season === null
        ? data.labels.seasonNo
        : data.labels.seasonNow.replace('{season}', data.season);
  data.basis.forEach((b, i) => {
    const x = P + (i % 2) * (tileW + gap);
    const ty = y + Math.floor(i / 2) * (tileH + gap);
    outline(x, ty, tileW, tileH, 24);
    text(b.label, x + 32, ty + 52, 28, tileW - 64, { weight: 600, color: colors.muted });
    text(b.key === 'season' ? season : b.value, x + 32, ty + 102, 34, tileW - 64, {
      weight: 700,
    });
  });
  y += tileH * 2 + gap + 90;

  // 내가 확인한 것(체크한 것만 ✓)
  const head = data.labels.myChecks;
  text(head, P, y, 40, 500, { weight: 700 });
  text(data.count, P + measure(head, 40, 700) + 20, y, 30, 500, { color: colors.soft });
  const lines = data.checkedPoints.length ? data.checkedPoints : [data.labels.noChecks];
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

  // 내용 높이에 맞춰 아래 빈 곳을 잘라냄(체크 수·출처 길이에 따라 높이가 달라짐)
  const used = Math.min(H, Math.ceil(y + 6 + 26 * 1.35 + P));
  if (used < H) {
    const copy = document.createElement('canvas');
    copy.width = W;
    copy.height = used;
    copy.getContext('2d')?.drawImage(canvas, 0, 0, W, used, 0, 0, W, used);
    canvas.height = used;
    ctx.drawImage(copy, 0, 0);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))),
      'image/png',
    ),
  );
}

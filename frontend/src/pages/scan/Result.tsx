import Recipes from '../../components/domain/Recipes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResult } from '../../hooks/useResult';
import { useRequireMarket } from '../../hooks/useFlows';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import AppHeader from '../../components/layout/AppHeader';
import Resource from '../../components/common/Resource';
import Button, { ButtonLink } from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { Chip, ChipRow } from '../../components/common/Chip';
import { IconButton, PriceGauge } from '../../components/common/parts';
import AskPanel from '../../components/domain/AskPanel';
import DecisionCardSheet from '../../components/domain/DecisionCardSheet';
import MapView, { type MapPin } from '../../components/map/MapView';
import { buildCardData, type CardData } from '../../utils/decisionCard';
import { priceWho } from '../map/helpers';
import { NO_BAND_MESSAGE } from '../../utils/priceBand';
import { storeCategory } from '../../utils/category';
import { formatPrice } from '../../utils/formatPrice';
import { unitLabel } from '../../utils/convertUnit';
import { euro, josa } from '../../utils/josa';
import { isMock } from '../../api/client';
import {
  ChecklistSection,
  PriceEditor,
  PriceHistoryChart,
  PriceTable,
  SellingStores,
  VarietyCompare,
} from './resultParts';
import { unitShort } from '../../utils/varietyBand';
import s from './result.module.css';

/** 찍은 사진의 미리보기 주소(기기 안에서만) */
function usePhotoUrl(photo?: File) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!photo || typeof URL.createObjectURL !== 'function') return;
    const next = URL.createObjectURL(photo);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  return photo ? url : '';
}

/**
 * 결과(/items/:itemId). 시안 순서: 결론 한 줄(코드가 고른 문구) → 가격 눈금 → 현장 가격과 기준시세 표
 * → 품종 비교 → 최근 4주 → 확인 포인트 → 물어보기 → 판매 점포.
 * 많이 낮으면 확인 포인트를 위로, 높으면 판매 점포를 위로(기획서 "살까 말까").
 */
export default function Result() {
  const t = useT();
  const f = useResult();
  const desktop = useIsDesktop();
  const [checks, setChecks] = useState<{ itemId: string; keys: string[] }>({
    itemId: '',
    keys: [],
  });
  if (checks.itemId !== f.itemId) setChecks({ itemId: f.itemId, keys: [] });
  const checked = checks.itemId === f.itemId ? checks.keys : [];
  const [editing, setEditing] = useState(false);
  const [card, setCard] = useState<CardData>();
  const closeCard = useCallback(() => setCard(undefined), []);
  const photoUrl = usePhotoUrl(f.nav.photo);
  const ready = useRequireMarket();

  const selling = useMemo(
    () =>
      (f.map.data?.stores ?? [])
        .filter((st) => st.highlight)
        .sort(
          (a, b) =>
            Number(b.store_id === f.storeId) - Number(a.store_id === f.storeId) ||
            Number(!!b.active_sale) - Number(!!a.active_sale) ||
            Number(!!b.price?.merchant_confirmed) - Number(!!a.price?.merchant_confirmed),
        ),
    [f.map.data, f.storeId],
  );
  if (!ready) return null;

  const item = f.item.data;
  const price = f.current;
  const verdict = f.verdict;
  const band = verdict?.band ?? null;
  const variety = price?.varieties.find((v) => v.variety_id === f.varietyId);
  const name = [...new Set([item?.name, variety?.name])].filter(Boolean).join(' ');
  const reference = variety ? variety.reference_price : (price?.reference_price ?? null);
  const cheaper =
    f.seen && band && band >= 3
      ? selling.filter(
          (st) =>
            st.price &&
            st.price.source !== 'market_avg' &&
            st.price.unit === f.unit &&
            st.price.price < f.seen!,
        )
      : [];
  const storesFirst = !!band && band >= 3;
  const checksFirst = band === 1;
  const storeName = f.map.data?.stores.find((st) => st.store_id === f.storeId)?.name;
  const mapHref = f.ctx.href('/', {
    item: f.itemId,
    variety: f.varietyId ?? null,
    unit: f.unit || null,
    store: f.storeId ?? null,
  });
  const varietyHref = f.ctx.href(`/items/${encodeURIComponent(f.itemId)}/varieties`, {
    variety: f.varietyId ?? null,
    unit: f.unit || null,
    store: f.storeId ?? null,
  });

  const headSub = f.seen
    ? [
        `${f.quantity}${unitShort(f.unit)}`,
        storeName
          ? t('scanTakenAt').replace('{store}', storeName)
          : f.nav.photo
            ? t('scanTaken')
            : t('scanEntered'),
      ].join(', ')
    : t('scanNoPriceSub');

  const conclusion = !f.seen
    ? t('scanNoPriceTitle')
    : price
      ? (verdict?.message ?? NO_BAND_MESSAGE)
      : f.price.loading
        ? t('loadingStatus')
        : NO_BAND_MESSAGE;
  const varietyLabel = variety?.name ?? item?.name ?? '';
  const conclusionSub =
    !f.seen || !price
      ? ''
      : verdict?.fallbackNote
        ? verdict.fallbackNote
        : verdict?.diff == null || reference == null
          ? t('scanNoReferenceSub').replace('{name}', josa(varietyLabel, '은', '는'))
          : // 제목이 이미 "기준시세보다 N% 낮아요"라서, 아래 줄은 무엇과 비교했는지만
            `${varietyLabel} 기준시세 ${reference.toLocaleString('ko-KR')}원과 비교했어요`;

  const toggle = (key: string) =>
    setChecks({
      itemId: f.itemId,
      keys: checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key],
    });

  const checklist = item && (
    <ChecklistSection
      criteria={item.criteria}
      checked={checked}
      onToggle={toggle}
      collapsed={storesFirst}
    />
  );
  const stores = (first: boolean) => (
    <Resource state={f.map}>
      <SellingStores
        title={
          first && cheaper.length
            ? t('scanCheaperStores')
            : t('scanSellingTitle').replace('{item}', item?.name ?? '')
        }
        stores={first && cheaper.length ? cheaper : selling}
        map={f.map.data}
        itemId={f.itemId}
        unit={f.unit}
        storeId={f.storeId}
        reference={reference}
        mapHref={mapHref}
        total={selling.length}
      />
      <div className={s.group}>
        <h3 className={s.groupLabel}>{f.storeId ? t('scanChosenStore') : t('scanWhichStore')}</h3>
        <ChipRow wrap label={t('scanWhichStore')}>
          {selling.slice(0, 8).map((st) => (
            <Chip
              key={st.store_id}
              pressed={f.storeId === st.store_id}
              onClick={() => f.setStoreId(st.store_id)}
            >
              {st.name}
            </Chip>
          ))}
          <Chip onClick={() => f.setStoreId(null)}>{t('scanSkip')}</Chip>
        </ChipRow>
        {Number(f.value) > 0 && (
          <p className={s.note}>
            {f.reportHeld ? '기준시세와 차이가 커서 확인 후 반영돼요' : t('scanReportNote')}
          </p>
        )}
      </div>
    </Resource>
  );

  const pins: MapPin[] = selling
    .filter((st) => st.lat != null && st.lng != null)
    .map((st) => ({
      id: st.store_id,
      name: st.name,
      lat: st.lat!,
      lng: st.lng!,
      category: storeCategory(st, f.map.data?.zones.find((z) => z.id === st.zone_id)?.name),
      state: st.store_id === f.storeId ? 'selected' : 'default',
      sale: !!st.active_sale,
      caption: st.price
        ? `${formatPrice(st.price.price)}${st.price.source === 'market_avg' ? ` · ${priceWho(st.price, t)}` : ''}`
        : undefined,
    }));

  const openCard = () => {
    if (!item || !f.market) return;
    setCard(
      buildCardData({
        item,
        market: f.market,
        checked,
        photo: f.nav.photo,
        price,
        value: f.value,
        quantity: f.quantity,
        unit: f.unit,
        store: f.map.data?.stores.find((st) => st.store_id === f.storeId),
        origin: window.location.origin,
      }),
    );
  };
  const cardDisabled = !item || !f.market || f.price.loading || f.map.loading;
  const actions = (
    <div className={s.actions}>
      <div className={s.actionsInner}>
        {storesFirst ? (
          <div className={s.actionRow}>
            <ButtonLink variant="primary" grow to={mapHref} icon={<Icon name="map" size={20} />}>
              {t('scanOtherStoresOnMap')}
            </ButtonLink>
            <Button disabled={cardDisabled} onClick={openCard}>
              {t('scanCard')}
            </Button>
          </div>
        ) : (
          <Button variant="primary" wide disabled={cardDisabled} onClick={openCard}>
            {t('decisionCardCreate')}
          </Button>
        )}
        {desktop && <p className={`${s.note} ${s.center}`}>{t('decisionCardPrivacy')}</p>}
      </div>
    </div>
  );

  return (
    <>
      {!desktop && (
        <AppHeader
          end={item && <IconButton icon="share" label={t('scanShare')} onClick={openCard} />}
        />
      )}
      <Resource state={f.item}>
        {item && (
          <div className={s.layout}>
            <div className={s.main}>
              <div className={s.group} style={{ gap: 8 }}>
                <div className={s.head}>
                  {photoUrl && (
                    <span className={s.thumb}>
                      <img src={photoUrl} alt={t('scanPhotoTaken')} />
                    </span>
                  )}
                  <div className={s.headBody}>
                    <h1 className={s.title}>{name || item.name}</h1>
                    <span className={s.sub}>{headSub}</span>
                  </div>
                </div>
                {f.nav.method === 'price_tag_photo' && !!f.nav.labels?.length && (
                  <p className={s.note}>
                    {t('visionLabels')}
                    {f.nav.labels.join(', ')}
                  </p>
                )}
              </div>

              {!!price && price.varieties.length >= 2 && (
                <div className={s.group}>
                  <div className={s.groupHead}>
                    <span className={s.groupLabel} id="variety-label">
                      {t('scanVariety')}
                    </span>
                    <Link className={s.smallLink} to={varietyHref} state={f.nav}>
                      {t('scanVarietyCompare')}
                      <Icon name="chevronRight" size={18} />
                    </Link>
                  </div>
                  <ChipRow wrap label={t('scanVariety')}>
                    {price.varieties.map((v) => (
                      <Chip
                        key={v.variety_id}
                        pressed={v.variety_id === f.varietyId}
                        onClick={() => f.setVariety(v.variety_id)}
                      >
                        {v.name} {v.mock && <small>예시</small>}
                      </Chip>
                    ))}
                  </ChipRow>
                  <p className={s.note}>
                    {f.varietyChosen && variety
                      ? f.varietyFrom === 'tag'
                        ? t('scanVarietyFromTagResult').replace('{name}', euro(variety.name))
                        : t('scanVarietySwitch')
                      : t('scanVarietyCheck')}
                  </p>
                </div>
              )}

              <section
                className={s.verdict}
                id="price-comparison"
                aria-live="polite"
                aria-labelledby="verdict"
              >
                <div className={s.verdictText}>
                  <h2 className={s.conclusion} id="verdict">
                    {conclusion}
                  </h2>
                  {price?.mock && <p>예시 시세 · 실제 조사값 아님</p>}
                  {conclusionSub && <p className={s.conclusionSub}>{conclusionSub}</p>}
                  {f.price.error && <p className={s.conclusionSub}>{f.price.error}</p>}
                </div>
                <PriceGauge band={band} label={band || f.seen ? undefined : t('scanGaugeNone')} />
                <PriceTable
                  price={price}
                  verdict={verdict}
                  seen={f.seen}
                  quantity={f.quantity}
                  total={Number(f.value) || undefined}
                  unit={f.unit}
                  editing={editing}
                  onEdit={() => setEditing(!editing)}
                  editor={<PriceEditor value={f.value} onChange={f.setValue} />}
                />
                {item.units.length > 1 && (
                  <ChipRow wrap label={t('saleUnit')}>
                    {item.units.map((u) => (
                      <Chip key={u} pressed={u === f.unit} onClick={() => f.setUnit(u)}>
                        {unitLabel(u)}
                      </Chip>
                    ))}
                  </ChipRow>
                )}
              </section>

              {checksFirst && checklist}
              {storesFirst && stores(true)}

              {!!price && !!f.seen && price.varieties.length >= 2 && (
                <VarietyCompare
                  price={price}
                  seen={f.seen}
                  itemId={f.itemId}
                  selected={f.varietyId}
                  onPick={f.setVariety}
                  more={varietyHref}
                />
              )}

              {variety?.description && (
                <p className={s.body}>
                  {variety.description}
                  {variety.description_source && <small> · {variety.description_source}</small>}
                </p>
              )}
              {variety?.harvest && <p className={s.body}>수확 시기 · {variety.harvest.label}</p>}
              {!!price && (
                <PriceHistoryChart
                  itemId={f.itemId}
                  varietyId={f.varietyId}
                  varietyName={variety?.name}
                  marketId={f.ctx.marketId ?? undefined}
                  unit={f.unit}
                  seen={f.seen}
                />
              )}

              {!checksFirst && checklist}
              <Recipes itemId={f.itemId} />

              <div className={s.group}>
                <AskPanel key={`ask:${f.itemId}`} itemId={f.itemId} />
                <Link className={s.inkLink} to={f.ctx.href('/chat', { item: f.itemId })}>
                  {t('scanAskMore')}
                  <Icon name="chevronRight" size={18} />
                </Link>
              </div>
            </div>

            <aside className={s.aside} aria-label={t('scanAside')}>
              {photoUrl && (
                <span className={s.asidePhoto}>
                  <img src={photoUrl} alt="" />
                </span>
              )}
              {desktop && pins.length > 0 && (
                <div className={s.asideMap}>
                  <MapView
                    label={t('scanSellingMap').replace('{item}', item.name)}
                    pins={pins}
                    boundary={f.map.data?.boundary}
                    sample={isMock}
                  />
                </div>
              )}
              {!storesFirst && stores(false)}
              {actions}
            </aside>
          </div>
        )}
      </Resource>
      {card && <DecisionCardSheet data={card} onClose={closeCard} />}
    </>
  );
}

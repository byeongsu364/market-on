import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchItems } from '../../api/items';
import { useResource } from '../../hooks/useResource';
import { useItem } from '../../hooks/useItem';
import { usePrice } from '../../hooks/usePrice';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import type { ResultNavState } from '../../hooks/useResult';
import { Chip, ChipRow } from '../../components/common/Chip';
import Button from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { Field, SearchBar, Stepper } from '../../components/common/parts';
import { unitLabel } from '../../utils/convertUnit';
import { formatPrice } from '../../utils/formatPrice';
import { josa, euro } from '../../utils/josa';
import { useT } from '../../i18n';
import type { RecognizeResponse } from '../../types/contract';
import s from './scan.module.css';

const unitShort = (u: string) => unitLabel(u).replace(/^1/, '');

/** 찾지 못한 품목을 이름으로 고르기("목록에 없어요") */
function PhotoSearch({ choose }: { choose: (id: string) => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const items = useResource(useCallback(() => searchItems(q), [q]));
  return (
    <div className={s.searchBox}>
      <SearchBar
        label={t('search')}
        placeholder={t('searchPlaceholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ChipRow wrap label={t('scanSearchResults')}>
        {items.data?.map((i) => (
          <Chip key={i.item_id} onClick={() => choose(i.item_id)}>
            {i.name}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

/**
 * 찍은 뒤 확인 단계(같은 주소의 다음 단계). 품목 후보, 품종(가격표에서 읽었거나 손님이 고른 것만),
 * 가격표에서 읽은 값. 가격표가 없으면 품종과 가격을 묻지 않고 넘어감.
 */
export default function ScanConfirm({
  result,
  photo,
  storeName,
  storeId,
  web,
}: {
  result: RecognizeResponse;
  photo: File;
  storeName?: string;
  storeId?: string;
  web?: boolean;
}) {
  const t = useT();
  const ctx = useShoppingContext();
  const navigate = useNavigate();
  const top = result.candidates[0];
  const [id, setId] = useState(top && top.confidence >= 0.8 ? top.item_id : '');
  const [searching, setSearching] = useState(false);
  const item = useItem(id);
  const tag = result.price_tag;
  const [variety, setVariety] = useState(tag?.variety_id ?? '');
  const [varietyFrom, setVarietyFrom] = useState<'tag' | 'choice' | undefined>(
    tag?.variety_id ? 'tag' : undefined,
  );
  const varieties = usePrice({
    item_id: tag ? id : '',
    market_id: ctx.marketId ?? '',
    unit: item.data?.default_unit ?? '',
  });
  const choices = varieties.data?.varieties ?? [];
  const chosenVariety = choices.find((v) => v.variety_id === variety);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(tag ? String(tag.price) : '');
  const [unit, setUnit] = useState(tag?.unit ?? '');
  const [quantity, setQuantity] = useState(tag?.quantity ?? 1);
  const effectiveUnit = item.data?.units.includes(unit) ? unit : (item.data?.default_unit ?? '');
  const priceValid =
    !price || (Number.isInteger(Number(price)) && Number(price) >= 10 && Number(price) <= 10000000);
  // 품종 목록이 오기 전에 넘어가도 가격표에서 읽은 품종은 넘김
  const passVariety = chosenVariety?.variety_id ?? (!varieties.data && variety ? variety : null);
  const name = item.data?.name ?? result.candidates.find((c) => c.item_id === id)?.name;

  const go = () => {
    const state: ResultNavState = {
      photo,
      labels: result.vision_labels,
      price: price ? Number(price) : undefined,
      quantity,
      method: 'price_tag_photo',
      media_id: result.media_id,
      varietyFrom: passVariety ? varietyFrom : undefined,
    };
    navigate(
      ctx.href(`/items/${encodeURIComponent(id)}`, {
        variety: passVariety,
        unit: effectiveUnit || null,
        store: storeId ?? null,
      }),
      { state },
    );
  };

  return (
    <div className={s.confirm}>
      <div className={s.group} style={{ gap: 6 }}>
        <h1 className={web ? s.webTitle : s.confirmTitle}>
          {name && id
            ? t('scanConfirmTitle').replace('{name}', josa(name, '이', '가'))
            : t('scanWhichItem')}
        </h1>
        <ChipRow wrap label={t('scanCandidates')}>
          {result.candidates.slice(0, 3).map((c) => (
            <Chip
              key={c.item_id}
              pressed={id === c.item_id}
              onClick={() => {
                setId(c.item_id);
                setVariety('');
              }}
            >
              {c.name}
            </Chip>
          ))}
          <Chip pressed={searching} onClick={() => setSearching(!searching)}>
            {t('missing')}
          </Chip>
        </ChipRow>
        {searching && (
          <PhotoSearch
            choose={(next) => {
              setId(next);
              setVariety('');
              setSearching(false);
            }}
          />
        )}
      </div>

      {tag && choices.length >= 2 && (
        <div className={s.group}>
          <div className={s.groupHead}>
            <span className={s.groupLabel} id="scan-variety">
              {t('scanVariety')}
            </span>
            <Link
              className={s.smallLink}
              to={ctx.href(`/items/${encodeURIComponent(id)}/varieties`, {
                unit: effectiveUnit || null,
              })}
            >
              {t('scanVarietyHow')}
              <Icon name="chevronRight" size={18} />
            </Link>
          </div>
          <ChipRow wrap label={t('scanVarietyConfirm')}>
            {choices.map((v) => (
              <Chip
                key={v.variety_id}
                pressed={v.variety_id === variety}
                onClick={() => {
                  setVariety(v.variety_id);
                  setVarietyFrom('choice');
                }}
              >
                {v.name}
              </Chip>
            ))}
          </ChipRow>
          <p className={s.note}>
            {chosenVariety && varietyFrom === 'tag'
              ? t('scanVarietyFromTag').replace('{name}', euro(chosenVariety.name))
              : t('scanVarietyRule')}
          </p>
        </div>
      )}

      {tag ? (
        <div className={s.priceBox}>
          <div className={s.priceBoxBody}>
            <span className={s.groupLabel}>{t('scanTagValue')}</span>
            {price ? (
              <span className={s.priceLine}>
                <span className={s.priceBig}>{formatPrice(Number(price))}</span>
                <span className={s.unitText}>
                  {quantity}
                  {effectiveUnit ? unitShort(effectiveUnit) : ''}
                </span>
              </span>
            ) : (
              <span className={s.unitText}>{t('scanNoPrice')}</span>
            )}
          </div>
          <Button variant="text" onClick={() => setEditing(!editing)} aria-expanded={editing}>
            {t('scanEdit')}
          </Button>
        </div>
      ) : (
        <p className={s.note}>{t('scanNoTag')}</p>
      )}

      {tag && editing && (
        <div className={s.edit}>
          <Field
            label={t('scanPriceOptional')}
            type="number"
            inputMode="numeric"
            min={10}
            max={10000000}
            value={price}
            suffix="원"
            error={priceValid ? undefined : t('scanPriceRange')}
            onChange={(e) => setPrice(e.target.value)}
          />
          <div className={s.stepperField}>
            <span className={s.fieldLabel}>{t('scanQuantity')}</span>
            <Stepper
              label={t('scanQuantity')}
              value={quantity}
              onChange={setQuantity}
              min={1}
              format={(v) => `${v}${effectiveUnit ? unitShort(effectiveUnit) : ''}`}
            />
          </div>
          {!!item.data?.units.length && (
            <ChipRow wrap label={t('saleUnit')}>
              {item.data.units.map((u) => (
                <Chip key={u} pressed={u === effectiveUnit} onClick={() => setUnit(u)}>
                  {unitLabel(u)}
                </Chip>
              ))}
            </ChipRow>
          )}
        </div>
      )}

      {storeName && <p className={s.note}>{t('scanAtStore').replace('{store}', storeName)}</p>}

      <div className={s.actions}>
        <Button variant="primary" wide disabled={!item.data || !id || !priceValid} onClick={go}>
          {t('scanSeeResult')}
        </Button>
        {tag && <p className={`${s.note} ${s.center}`}>{t('scanNoTagHint')}</p>}
      </div>
    </div>
  );
}

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchItems } from '../../api/items';
import { useResource } from '../../hooks/useResource';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useStoreId, type ResultNavState } from '../../hooks/useResult';
import AppHeader from '../../components/layout/AppHeader';
import Button from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { Chip, ChipRow } from '../../components/common/Chip';
import { Field, ItemTile, Stepper } from '../../components/common/parts';
import Resource from '../../components/common/Resource';
import { unitLabel } from '../../utils/convertUnit';
import { useT } from '../../i18n';
import type { Item } from '../../types/contract';
import s from './scan.module.css';

const unitShort = (u: string) => unitLabel(u).replace(/^1(?=\D)/, '');

/** 직접 입력(/scan?mode=manual). 사진 인식이 안 될 때도 여기로 옴. 가격은 선택 */
export default function ScanManual() {
  const t = useT();
  const ctx = useShoppingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const storeId = useStoreId();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('');
  const results = useResource(useCallback(() => searchItems(q), [q]));
  const priceValid =
    !price || (Number.isInteger(Number(price)) && Number(price) >= 10 && Number(price) <= 10000000);
  const effectiveUnit = item?.units.includes(unit) ? unit : (item?.default_unit ?? '');
  return (
    <>
      <AppHeader title={t('scanManualTitle')} back={ctx.href('/scan')} />
      <form
        className={s.manual}
        onSubmit={(e) => {
          e.preventDefault();
          if (!item || !priceValid) return;
          const state: ResultNavState = {
            price: price ? Number(price) : undefined,
            quantity,
            method: 'manual',
          };
          navigate(
            ctx.href(`/items/${encodeURIComponent(item.item_id)}`, {
              unit: effectiveUnit || null,
              store: storeId ?? null,
            }),
            { state },
          );
        }}
      >
        {notice && (
          <div className={s.notice} role="alert">
            <Icon name="alert" size={22} />
            <span>{notice}</span>
          </div>
        )}
        <Field
          label={t('item')}
          type="search"
          placeholder={t('searchPlaceholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setMore(false);
            setItem(null);
          }}
        />
        <Resource state={results}>
          <fieldset className={s.options}>
            <legend className="sr-only">{t('scanPickItem')}</legend>
            {(more ? results.data : results.data?.slice(0, 18))?.map((i) => (
              <label className={s.option} key={i.item_id}>
                <ItemTile itemId={i.item_id} />
                <span className={s.optionBody}>
                  <span className={s.optionTitle}>{i.name}</span>
                </span>
                <input
                  className={s.radio}
                  type="radio"
                  name="item"
                  checked={item?.item_id === i.item_id}
                  onChange={() => {
                    setItem(i);
                    setUnit(i.default_unit);
                  }}
                />
              </label>
            ))}
            {results.data?.length === 0 && <p className={s.note}>{t('searchEmpty')}</p>}
          </fieldset>
          {!more && (results.data?.length ?? 0) > 18 && (
            <button type="button" onClick={() => setMore(true)}>
              품목 더 보기
            </button>
          )}
        </Resource>
        <div className={s.twoCols}>
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
        </div>
        {item && item.units.length > 0 && (
          <div className={s.group}>
            <span className={s.groupLabel}>{t('saleUnit')}</span>
            <ChipRow wrap label={t('saleUnit')}>
              {item.units.map((u) => (
                <Chip key={u} pressed={u === effectiveUnit} onClick={() => setUnit(u)}>
                  {unitLabel(u)}
                </Chip>
              ))}
            </ChipRow>
          </div>
        )}
        <div className={s.bottomBar}>
          <div className={s.bottomInner}>
            <Button type="submit" variant="primary" wide disabled={!item || !priceValid}>
              {t('scanSeeResult')}
            </Button>
            <span className={`${s.note} ${s.center}`}>{t('scanManualHint')}</span>
          </div>
        </div>
      </form>
    </>
  );
}

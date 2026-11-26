import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSaleNew } from '../../hooks/useMerchant';
import Resource from '../../components/common/Resource';
import Button from '../../components/common/Button';
import ErrorBox from '../../components/common/ErrorBox';
import { Chip, ChipRow } from '../../components/common/Chip';
import { Field } from '../../components/common/parts';
import AppHeader from '../../components/layout/AppHeader';
import { formatPrice } from '../../utils/formatPrice';
import { saleTime } from '../../utils/sale';
import { unitLabel } from '../../utils/convertUnit';
import { itemImage } from '../../utils/itemImage';
import { useT } from '../../i18n';
import { Footer } from './parts';
import { fill } from './format';
import a from '../account/account.module.css';
import s from './merchant.module.css';

// 마감세일 올리기. page = SaleNew(모바일 한 화면), aside = WebMerchant 오른쪽 면.
// 단골 알림 수는 백엔드가 없어 mock에서만 보임(030 5장).
export default function SaleForm({
  variant = 'page',
  onDone,
}: {
  variant?: 'page' | 'aside';
  onDone?: () => void;
}) {
  const f = useSaleNew();
  const t = useT();
  const navigate = useNavigate();
  const item = f.catalog.data?.find((i) => i.item_id === f.item);
  const unit = f.unit || item?.default_unit || '';
  const price = Number(f.price);
  const favorites = f.extras.data?.favorites;
  const ready = !!item && price > 0;
  const what = item ? `${item.name} ${unitLabel(unit)}` : '';
  const summary = ready
    ? fill(
        t(variant === 'aside' && favorites ? 'merchantSaleSummaryNotify' : 'merchantSaleSummary'),
        {
          time: saleTime(f.endsAt),
          item: what,
          price: formatPrice(price),
          n: favorites ?? 0,
        },
      )
    : '';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void f.submit().then((result) => {
      if (!result) return;
      if (onDone) onDone();
      else navigate('/merchant');
    });
  };
  const digits = (v: string) => v.replace(/[^0-9]/g, '');
  const ends = (
    <div className={a.group}>
      <span className={s.groupLabel} id={`${variant}-ends`}>
        {t('endsAt')}
      </span>
      <div className={a.seg} role="radiogroup" aria-labelledby={`${variant}-ends`}>
        {[1, 2, 0].map((n) => (
          <button
            type="button"
            role="radio"
            key={n}
            aria-checked={f.duration === n}
            disabled={n === 0 && !f.store.data?.hours.close}
            onClick={() => f.setDuration(n)}
          >
            {t(n === 1 ? 'oneHour' : n === 2 ? 'twoHours' : 'businessClose')}
          </button>
        ))}
      </div>
    </div>
  );
  const fields: ReactNode = (
    <>
      <Resource state={f.store}>
        <div className={s.group}>
          <span className={s.groupLabel}>{t('item')}</span>
          <ChipRow label={t('item')} wrap>
            {f.catalog.data
              ?.filter((i) => f.store.data?.item_ids.includes(i.item_id))
              .map((i) => {
                const src = itemImage(i.item_id);
                return (
                  <Chip
                    key={i.item_id}
                    pressed={i.item_id === f.item}
                    icon={src && <img className={s.chipImg} src={src} alt="" />}
                    onClick={() => {
                      f.setItem(i.item_id);
                      f.setVariety('');
                      f.setUnit(i.default_unit);
                    }}
                  >
                    {i.name}
                  </Chip>
                );
              })}
          </ChipRow>
        </div>
      </Resource>
      {!!f.varieties.data?.length && (
        <ChipRow label="품종" wrap>
          <Chip pressed={!f.variety} onClick={() => f.setVariety('')}>
            품종 선택 안 함
          </Chip>
          {f.varieties.data.map((v) => (
            <Chip
              key={v.variety_id}
              pressed={f.variety === v.variety_id}
              onClick={() => f.setVariety(v.variety_id)}
            >
              {v.name}
            </Chip>
          ))}
        </ChipRow>
      )}
      <div className={s.fieldRow}>
        <Field
          label={t('discountPrice')}
          required
          inputMode="numeric"
          pattern="[0-9]+"
          suffix="원"
          value={f.price}
          onChange={(e) => f.setPrice(digits(e.target.value))}
          style={{ height: 54 }}
        />
        <Field
          label={t('regularOptional')}
          inputMode="numeric"
          pattern="[0-9]+"
          suffix="원"
          value={f.regular}
          onChange={(e) => f.setRegular(digits(e.target.value))}
          style={{ height: 54 }}
        />
      </div>
      {item && item.units.length > 1 && (
        <div className={s.group}>
          <span className={s.groupLabel}>{t('saleUnit')}</span>
          <ChipRow label={t('saleUnit')} wrap>
            {item.units.map((u) => (
              <Chip key={u} pressed={u === unit} onClick={() => f.setUnit(u)}>
                {unitLabel(u)}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}
      {ends}
    </>
  );
  const error = f.action.error && <ErrorBox message={f.action.error} />;
  if (variant === 'aside')
    return (
      <form className={s.aside} onSubmit={submit} aria-labelledby="aside-sale">
        <h2 className={s.h2} id="aside-sale">
          {t('postSale')}
        </h2>
        {fields}
        <div className={`${s.heading} ${s.gap10}`}>
          <Button type="submit" variant="primary" wide loading={f.action.loading} disabled={!ready}>
            {t('publish')}
          </Button>
          {summary && (
            <p className={`${s.help} ${s.center}`} aria-live="polite">
              {summary}
            </p>
          )}
        </div>
        {error}
      </form>
    );
  return (
    <form onSubmit={submit}>
      <AppHeader title={t('postSale')} back="/merchant" />
      <div className={`${s.main} ${s.gap24} ${s.withFooter}`}>
        {fields}
        {ready && (
          <div className={s.heading}>
            <span className={s.groupLabel}>{t('merchantPreview')}</span>
            <div className={s.preview}>
              <span className={s.previewTile} aria-hidden="true">
                {itemImage(item.item_id) && <img src={itemImage(item.item_id)!} alt="" />}
              </span>
              <div className={s.rowBody}>
                <span className={s.rowSub}>{f.store.data?.name}</span>
                <div className={s.rowLine}>
                  <span className={s.rowTitle}>{what}</span>
                  <span className={s.price}>{formatPrice(price)}</span>
                  {Number(f.regular) > price && (
                    <span className={s.strike}>{formatPrice(Number(f.regular))}</span>
                  )}
                </div>
                <span className={s.until}>
                  {saleTime(f.endsAt)}
                  {t('until')}
                </span>
              </div>
            </div>
            {favorites !== undefined && (
              <p className={s.help}>
                {fill(t('merchantNotify'), { n: favorites })} {t('merchantSampleValues')}
              </p>
            )}
          </div>
        )}
        {error}
      </div>
      <Footer sub={summary && <span aria-live="polite">{summary}</span>}>
        <Button type="submit" variant="primary" grow loading={f.action.loading} disabled={!ready}>
          {t('publish')}
        </Button>
      </Footer>
    </form>
  );
}

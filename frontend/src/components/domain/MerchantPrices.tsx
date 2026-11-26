import { useState, type ReactNode } from 'react';
import { getPrices, confirmPrice } from '../../api/merchant';
import { useResource, useAction } from '../../hooks/useResource';
import type { MerchantPriceRow } from '../../types/contract';
import Resource from '../common/Resource';
import ErrorBox from '../common/ErrorBox';
import Button from '../common/Button';
import { Field } from '../common/parts';
import { priceTime } from '../../utils/priceTime';
import { formatPrice } from '../../utils/formatPrice';
import { unitLabel } from '../../utils/convertUnit';
import { useT } from '../../i18n';
import { DataTable, Section } from '../../pages/merchant/parts';
import { fill } from '../../pages/merchant/format';
import s from '../../pages/merchant/merchant.module.css';

// 손님이 확인한 가격(Merchant·WebMerchant 시안). 맞아요 = 손님 가격 그대로 상인 확인, 고쳐요 = 가격을 적어 확인.
export default function MerchantPrices({ desktop = false }: { desktop?: boolean }) {
  const t = useT();
  const rows = useResource(getPrices);
  const [editing, setEditing] = useState('');
  const [value, setValue] = useState('');
  const action = useAction(async (item_id: string, unit: string, price: number) => {
    const result = await confirmPrice({ item_id, unit, price });
    rows.retry();
    setEditing('');
    return result;
  });
  const label = (r: MerchantPriceRow) => `${r.name} ${unitLabel(r.unit)}`;
  const who = (r: MerchantPriceRow) =>
    r.customers
      ? fill(t('merchantPricesBy'), {
          n: r.customers.reporters,
          time: priceTime(r.customers.latest_at),
        })
      : t('merchantPriceNone');
  const mine = (r: MerchantPriceRow) =>
    r.my_confirmation && (
      <p className={s.rowSub}>
        {fill(t('merchantPriceMine'), {
          time: priceTime(r.my_confirmation.confirmed_at),
          price: formatPrice(r.my_confirmation.price),
        })}
      </p>
    );
  const buttons = (r: MerchantPriceRow): ReactNode => (
    <span className={s.actions}>
      {r.customers && (
        <Button
          size="sm"
          variant="primary"
          disabled={action.loading}
          aria-label={`${r.name} ${t('merchantPriceRight')}`}
          onClick={() => void action.run(r.item_id, r.unit, r.customers!.price)}
        >
          {t('merchantPriceRight')}
        </Button>
      )}
      <Button
        size="sm"
        variant="surface"
        aria-expanded={editing === r.item_id}
        onClick={() => {
          setEditing(editing === r.item_id ? '' : r.item_id);
          setValue('');
        }}
      >
        {t('merchantPriceFix')}
      </Button>
    </span>
  );
  const form = (r: MerchantPriceRow) =>
    editing === r.item_id && (
      <form
        className={s.editForm}
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(r.item_id, r.unit, Number(value));
        }}
      >
        <Field
          label={t('merchantPriceInput')}
          type="number"
          inputMode="numeric"
          min="10"
          max="10000000"
          step="1"
          required
          suffix="원"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="md" variant="surface" loading={action.loading}>
          {t('merchantPriceSave')}
        </Button>
      </form>
    );
  return (
    <Section title={t('merchantPricesTitle')} gap={desktop ? 4 : 0}>
      <Resource state={rows}>
        {desktop ? (
          <>
            <DataTable
              head={[t('merchantColItem'), t('merchantColPrice'), t('merchantColCheck'), '']}
              rows={(rows.data ?? []).map((r) => ({
                key: r.item_id,
                cells: [
                  <>
                    {label(r)}
                    {mine(r)}
                  </>,
                  r.customers ? formatPrice(r.customers.price) : '',
                  who(r),
                  buttons(r),
                ],
              }))}
            />
            {rows.data?.map((r) => (
              <div key={r.item_id}>{form(r)}</div>
            ))}
          </>
        ) : (
          <ul className={s.list}>
            {rows.data?.map((r) => (
              <li key={r.item_id}>
                <div className={`${s.row} ${s.rowTight}`}>
                  <div className={s.rowBody}>
                    <div className={s.rowLine}>
                      <span className={s.rowTitle}>{label(r)}</span>
                      {r.customers && (
                        <span className={s.price}>{formatPrice(r.customers.price)}</span>
                      )}
                    </div>
                    <span className={s.rowSub}>{who(r)}</span>
                    {mine(r)}
                  </div>
                  {buttons(r)}
                </div>
                {form(r)}
              </li>
            ))}
          </ul>
        )}
      </Resource>
      {action.error && <ErrorBox message={action.error} />}
    </Section>
  );
}

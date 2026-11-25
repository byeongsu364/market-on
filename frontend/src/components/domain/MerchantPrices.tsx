import { useState } from 'react';
import { getPrices, confirmPrice } from '../../api/merchant';
import { useResource, useAction } from '../../hooks/useResource';
import Resource from '../common/Resource';
import ErrorBox from '../common/ErrorBox';
import StorePriceDisplay from './StorePriceDisplay';
import { priceTime } from '../../utils/priceTime';
export default function MerchantPrices() {
  const rows = useResource(getPrices);
  const [editing, setEditing] = useState('');
  const [value, setValue] = useState('');
  const action = useAction(async (item_id: string, unit: string, price: number) => {
    const result = await confirmPrice({ item_id, unit, price });
    rows.retry();
    setEditing('');
    return result;
  });
  return (
    <section className="card">
      <h2>손님이 본 오늘 가격</h2>
      <p>손님이 가격표를 찍으면 여기에 쌓여요. 확인을 누르면 손님 화면에 '상인 확인'이 붙어요</p>
      <Resource state={rows}>
        {rows.data?.map((row) => (
          <article key={row.item_id}>
            <h3>{row.name}</h3>
            <StorePriceDisplay price={row.customers} showConfirmation={!row.my_confirmation} />
            {row.my_confirmation && (
              <p>
                상인 확인 · {priceTime(row.my_confirmation.confirmed_at)}
                {' · '}
                {row.my_confirmation.price.toLocaleString()}원
              </p>
            )}
            {row.customers && (
              <button
                className="secondary"
                disabled={action.loading}
                onClick={() => void action.run(row.item_id, row.unit, row.customers!.price)}
              >
                확인
              </button>
            )}
            <button
              className="secondary"
              onClick={() => {
                setEditing(row.item_id);
                setValue('');
              }}
            >
              고쳐서 확인
            </button>
            {editing === row.item_id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(row.item_id, row.unit, Number(value));
                }}
              >
                <label>
                  확인 가격
                  <input
                    aria-label="확인 가격"
                    type="number"
                    min="10"
                    max="10000000"
                    step="1"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </label>
                <button disabled={action.loading}>가격 확인</button>
              </form>
            )}
          </article>
        ))}
      </Resource>
      {action.error && <ErrorBox message={action.error} />}
    </section>
  );
}

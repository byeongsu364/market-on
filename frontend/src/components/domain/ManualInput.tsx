import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchItems } from '../../api/items';
import { useResource } from '../../hooks/useResource';
import { unitLabel } from '../../utils/convertUnit';
import type { Item } from '../../types/contract';
import Resource from '../common/Resource';
export default function ManualInput() {
  const [q, setQ] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const results = useResource(useCallback(() => searchItems(q), [q]));
  const navigate = useNavigate();
  return (
    <section>
      <h2>직접 입력</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (item && Number(price) >= 10 && Number(price) <= 10000000)
            navigate(`/items/${encodeURIComponent(item.item_id)}`, {
              state: {
                price: Number(price),
                unit: unit || item.default_unit,
                quantity: 1,
                method: 'manual',
              },
            });
        }}
      >
        <label>
          품목 이름
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setItem(null);
            }}
          />
        </label>
        <Resource state={results}>
          <div className="chips">
            {results.data?.map((i) => (
              <button
                type="button"
                className="chip"
                key={i.item_id}
                aria-pressed={item?.item_id === i.item_id}
                onClick={() => {
                  setItem(i);
                  setUnit(i.default_unit);
                }}
              >
                {i.name}
              </button>
            ))}
          </div>
        </Resource>
        <label>
          가격 (필수)
          <input
            required
            inputMode="numeric"
            type="number"
            min="10"
            max="10000000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        {!price && <p className="caption">직접 입력할 때는 가격을 함께 알려 주세요</p>}
        <div className="chips">
          {item?.units.map((u) => (
            <button
              type="button"
              className="chip"
              key={u}
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
            >
              {unitLabel(u)}
            </button>
          ))}
        </div>
        <button className="wide" disabled={!item || Number(price) < 10 || Number(price) > 10000000}>
          확인하기
        </button>
      </form>
    </section>
  );
}

import { useNavigate } from 'react-router-dom';
import { useSaleNew } from '../../hooks/useMerchant';
import Resource from '../../components/common/Resource';
import Button from '../../components/common/Button';
import ErrorBox from '../../components/common/ErrorBox';
import { formatPrice } from '../../utils/formatPrice';
import { saleTime } from '../../utils/sale';
import { useT } from '../../i18n';
export default function SaleNew() {
  const f = useSaleNew();
  const t = useT();
  const navigate = useNavigate();
  const name = f.catalog.data?.find((i) => i.item_id === f.item)?.name;
  return (
    <>
      <h1>{t('postSale')}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit().then((result) => {
            if (result) navigate('/merchant');
          });
        }}
      >
        <Resource state={f.store}>
          <div className="chips" aria-label={t('item')}>
            {f.catalog.data
              ?.filter((i) => f.store.data?.item_ids.includes(i.item_id))
              .map((i) => (
                <button
                  type="button"
                  className="chip"
                  aria-pressed={i.item_id === f.item}
                  key={i.item_id}
                  onClick={() => f.setItem(i.item_id)}
                >
                  {i.name}
                </button>
              ))}
          </div>
        </Resource>
        <label>
          {t('discountPrice')}
          <input
            required
            inputMode="numeric"
            pattern="[0-9]+"
            value={f.price}
            onChange={(e) => f.setPrice(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </label>
        <details>
          <summary>{t('regularOptional')}</summary>
          <label>
            {t('regularPrice')}
            <input
              inputMode="numeric"
              pattern="[0-9]+"
              value={f.regular}
              onChange={(e) => f.setRegular(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
        </details>
        <fieldset>
          <legend>{t('endsAt')}</legend>
          <div className="chips">
            {[1, 2, 0].map((n) => (
              <button
                type="button"
                className="chip"
                key={n}
                aria-pressed={f.duration === n}
                onClick={() => f.setDuration(n)}
              >
                {t(n === 1 ? 'oneHour' : n === 2 ? 'twoHours' : 'businessClose')}
              </button>
            ))}
          </div>
        </fieldset>
        {name && Number(f.price) > 0 && (
          <p aria-live="polite">
            {saleTime(f.endsAt)}
            {t('until')} {name} {formatPrice(Number(f.price))}
            {t('publishSentence')}
          </p>
        )}
        <div className="fixed-action">
          <Button
            className="wide"
            type="submit"
            loading={f.action.loading}
            disabled={!f.item || Number(f.price) <= 0}
          >
            {t('publish')}
          </Button>
        </div>
        {f.action.error && <ErrorBox message={f.action.error} />}
      </form>
    </>
  );
}

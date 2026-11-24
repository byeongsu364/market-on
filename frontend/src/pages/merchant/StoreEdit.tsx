import { useStoreEdit } from '../../hooks/useMerchant';
import Resource from '../../components/common/Resource';
import Button from '../../components/common/Button';
import ErrorBox from '../../components/common/ErrorBox';
import { useT } from '../../i18n';
const times = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);
export default function StoreEdit() {
  const f = useStoreEdit();
  const t = useT();
  return (
    <>
      <h1>{t('storeInfo')}</h1>
      <Resource state={f.store}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.save();
          }}
        >
          {(['open', 'close'] as const).map((key) => (
            <label key={key}>
              {t(key === 'open' ? 'openingTime' : 'closingTime')}
              <select
                value={f.value[key]}
                onChange={(e) => f.setHours({ ...f.value, [key]: e.target.value })}
              >
                {times.map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </select>
            </label>
          ))}
          <h2>{t('sells')}</h2>
          <Resource state={f.catalog}>
            <div className="chips">
              {f.catalog.data?.map((i) => (
                <button
                  type="button"
                  className="chip"
                  key={i.item_id}
                  aria-pressed={f.chosen.includes(i.item_id)}
                  onClick={() => f.toggle(i.item_id)}
                >
                  {i.name}
                </button>
              ))}
            </div>
          </Resource>
          <Button
            type="submit"
            className="wide"
            loading={f.action.loading}
            disabled={!f.chosen.length}
          >
            {t('save')}
          </Button>
          {f.action.error && <ErrorBox message={f.action.error} />}
          {f.action.data && <p role="status">{t('saved')}</p>}
        </form>
      </Resource>
    </>
  );
}

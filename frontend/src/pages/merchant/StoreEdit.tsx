import { useStoreEdit } from '../../hooks/useMerchant';
import Resource from '../../components/common/Resource';
import Button from '../../components/common/Button';
import ErrorBox from '../../components/common/ErrorBox';
import { Chip, ChipRow } from '../../components/common/Chip';
import AppHeader from '../../components/layout/AppHeader';
import { itemImage } from '../../utils/itemImage';
import { useT } from '../../i18n';
import { Footer } from './parts';
import s from './merchant.module.css';

const times = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);

export default function StoreEdit() {
  const f = useStoreEdit();
  const t = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void f.save();
      }}
    >
      <AppHeader title={t('storeInfo')} back="/merchant" />
      <div className={`${s.main} ${s.gap24} ${s.withFooter}`}>
        <Resource state={f.store}>
          <div className={s.fieldRow}>
            {(['open', 'close'] as const).map((key) => (
              <div className={s.selectField} key={key}>
                <label htmlFor={`se-${key}`}>
                  {t(key === 'open' ? 'openingTime' : 'closingTime')}
                </label>
                <select
                  id={`se-${key}`}
                  className={s.select}
                  value={f.value[key]}
                  onChange={(e) => f.setHours({ ...f.value, [key]: e.target.value })}
                >
                  {times.map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className={s.group}>
            <span className={s.groupLabel}>{t('sells')}</span>
            <Resource state={f.catalog}>
              <ChipRow label={t('sells')} wrap>
                {f.catalog.data?.map((i) => {
                  const src = itemImage(i.item_id);
                  return (
                    <Chip
                      key={i.item_id}
                      pressed={f.chosen.includes(i.item_id)}
                      icon={src && <img className={s.chipImg} src={src} alt="" />}
                      onClick={() => f.toggle(i.item_id)}
                    >
                      {i.name}
                    </Chip>
                  );
                })}
              </ChipRow>
            </Resource>
            <p className={s.help}>{t('merchantSellsHelp')}</p>
          </div>
          <div className={s.group}>
            <span className={s.groupLabel}>결제 수단</span>
            <ChipRow label="결제 수단" wrap>
              {(['card', 'cash', 'transfer', 'onnuri'] as const).map((method, i) => (
                <Chip
                  key={method}
                  pressed={f.paymentValue.includes(method)}
                  onClick={() =>
                    f.setPayments(
                      f.paymentValue.includes(method)
                        ? f.paymentValue.filter((p) => p !== method)
                        : [...f.paymentValue, method],
                    )
                  }
                >
                  {['카드', '현금', '계좌이체', '온누리상품권'][i]}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <div className={s.group}>
            <label htmlFor="store-intro" className={s.groupLabel}>
              한 줄 소개
            </label>
            <input
              id="store-intro"
              className={s.select}
              maxLength={80}
              value={f.introValue}
              onChange={(e) => f.setIntro(e.target.value)}
            />
          </div>
          {f.action.error && <ErrorBox message={f.action.error} />}
          {f.action.data && (
            <p role="status" className={s.lead}>
              {t('saved')}
            </p>
          )}
        </Resource>
      </div>
      <Footer>
        <Button
          type="submit"
          variant="primary"
          grow
          loading={f.action.loading}
          disabled={!f.chosen.length}
        >
          {t('save')}
        </Button>
      </Footer>
    </form>
  );
}

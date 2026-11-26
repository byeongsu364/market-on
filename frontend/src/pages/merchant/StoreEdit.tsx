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

// StoreEdit: 영업시간과 취급 품목(지금 API PATCH /merchant/store).
// 시안의 품종·결제 수단·한 줄 소개는 저장할 API가 없어 이번에는 넣지 않음(030 5장 표 참고).
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

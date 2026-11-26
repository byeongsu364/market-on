import MerchantPrices from '../../components/domain/MerchantPrices';
import { Link } from 'react-router-dom';
import { useMerchantHome } from '../../hooks/useMerchant';
import { useAuth } from '../../hooks/useAuth';
import { useItemCatalog } from '../../hooks/useFlows';
import Resource from '../../components/common/Resource';
import ErrorBox from '../../components/common/ErrorBox';
import { formatPrice } from '../../utils/formatPrice';
import { saleTime } from '../../utils/sale';
import { useT } from '../../i18n';
export default function MerchantHome() {
  const f = useMerchantHome();
  const auth = useAuth();
  const catalog = useItemCatalog();
  const t = useT();
  return (
    <>
      <h1>{auth.user?.store?.name}</h1>
      <Resource state={f.store}>
        {f.store.data && (
          <div className="merchant-stats">
            <p>
              {t('storeViews')}
              <strong className="big-number">
                {f.store.data.today_views}
                {t('people')}
              </strong>
            </p>
            <p>
              {t('saleViews')}
              <strong className="big-number">
                {f.store.data.sale_views}
                {t('people')}
              </strong>
            </p>
          </div>
        )}
      </Resource>
      <MerchantPrices />
      <Link className="button wide" to="/merchant/sale/new">
        {t('postSale')}
      </Link>
      {(['active', 'ended'] as const).map((status) => (
        <section key={status}>
          <h2>{t(status === 'active' ? 'activeSales' : 'endedSales')}</h2>
          <Resource state={f[status]}>
            {f[status].data?.map((s) => (
              <article className="card" key={s.id}>
                <h3>{catalog.data?.find((i) => i.item_id === s.item_id)?.name}</h3>
                <p>
                  {saleTime(s.ends_at)}
                  {t('until')} {formatPrice(s.sale_price)}
                </p>
                <button
                  className="secondary"
                  disabled={f.action.loading}
                  onClick={() => void f.action.run(s.id, status === 'ended')}
                >
                  {t(status === 'active' ? 'endSale' : 'repostSale')}
                </button>
              </article>
            ))}
            {f[status].data?.length === 0 && <p>{t('noSales')}</p>}
          </Resource>
        </section>
      ))}
      {f.action.error && <ErrorBox message={f.action.error} />}
      <div className="merchant-links">
        {/* 점포 정보·QR 포스터는 메뉴에서 숨김 (2026-11-26 결정, 라우트는 남김) */}
        <button className="secondary" onClick={() => void auth.logout()}>
          {t('logout')}
        </button>
      </div>
    </>
  );
}

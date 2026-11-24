import { Link } from 'react-router-dom';
import type { ActiveSale } from '../../types/contract';
import { useSaleView } from '../../hooks/useSales';
import { formatPrice } from '../../utils/formatPrice';
import { saleTime } from '../../utils/sale';
import { useT } from '../../i18n';
export default function StoreCard({ sale }: { sale: ActiveSale }) {
  const t = useT();
  const ref = useSaleView(sale.id);
  return (
    <article className="card" ref={ref}>
      <h3>{sale.item_name}</h3>
      <Link to={`/s/${sale.store_id}`}>{sale.store_name}</Link>
      <p>
        {saleTime(sale.ends_at)}
        {t('until')} <strong>{formatPrice(sale.sale_price)}</strong>
        {sale.regular_price && (
          <>
            {' '}
            ({t('regularPrice')} {formatPrice(sale.regular_price)})
          </>
        )}
      </p>
      <small>{t('merchantSource')}</small>
    </article>
  );
}

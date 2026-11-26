import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMerchantHome } from '../../hooks/useMerchant';
import { useAuth } from '../../hooks/useAuth';
import { useItemCatalog } from '../../hooks/useFlows';
import { useMarkets } from '../../hooks/useMarkets';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import Resource from '../../components/common/Resource';
import ErrorBox from '../../components/common/ErrorBox';
import Button, { ButtonLink } from '../../components/common/Button';
import { Tag } from '../../components/common/Chip';
import Icon, { type IconName } from '../../components/common/Icon';
import { ItemTile, Toggle } from '../../components/common/parts';
import AppHeader from '../../components/layout/AppHeader';
import MerchantPrices from '../../components/domain/MerchantPrices';
import type { ClosingSale } from '../../types/contract';
import { formatPrice } from '../../utils/formatPrice';
import { saleTime } from '../../utils/sale';
import { unitLabel } from '../../utils/convertUnit';
import { useT } from '../../i18n';
import SaleForm from './SaleForm';
import { DataTable, LogoutButton, RoleHeader, Section, Stat } from './parts';
import { fill } from './format';
import s from './merchant.module.css';

// Merchant · WebMerchant: 승인된 상인의 홈.
// 오늘 조회 수·세일 조회 수·진행 중 세일·가격 확인은 지금 API, 단골 수·오늘 품절·가게 위치는 mock만(030 5장).
export default function MerchantHome() {
  const f = useMerchantHome();
  const auth = useAuth();
  const catalog = useItemCatalog();
  const markets = useMarkets();
  const desktop = useIsDesktop();
  const t = useT();
  const [formKey, setFormKey] = useState(0);
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const store = f.store.data;
  const extras = f.extras.data;
  const market = markets.data?.find((m) => m.market_id === store?.market_id)?.name;
  const itemName = (id: string) => catalog.data?.find((i) => i.item_id === id)?.name ?? '';
  const saleName = (sale: ClosingSale) =>
    [itemName(sale.item_id), sale.unit_id ? unitLabel(sale.unit_id) : ''].filter(Boolean).join(' ');
  const people = (n: number) => `${n}${t('people')}`;

  const stats = (
    <Resource state={f.store}>
      {store && (
        <div className={desktop ? s.webStats : s.stats}>
          <Stat value={people(store.today_views)} label={t('storeViews')} />
          <Stat value={people(store.sale_views)} label={t('saleViews')} />
          {extras && <Stat value={people(extras.favorites)} label={t('merchantFavorites')} />}
        </div>
      )}
      {extras && <p className={s.help}>{t('merchantSampleValues')}</p>}
    </Resource>
  );

  const endButton = (sale: ClosingSale, repost = false) => (
    <Button
      size="sm"
      variant="surface"
      disabled={f.action.loading}
      aria-label={`${saleName(sale)} ${t(repost ? 'repostSale' : 'endSale')}`}
      onClick={() => void f.action.run(sale.id, repost)}
    >
      {t(repost ? 'repostSale' : 'endSale')}
    </Button>
  );
  const saleList = (status: 'active' | 'ended') => (
    <Resource state={f[status]}>
      {f[status].data?.length === 0 && <p className={s.empty}>{t('noSales')}</p>}
      {desktop && status === 'active' ? (
        !!f.active.data?.length && (
          <DataTable
            head={[
              t('merchantColItem'),
              t('merchantColSalePrice'),
              t('merchantColEnds'),
              t('merchantColSeen'),
              '',
            ]}
            rows={f.active.data.map((sale) => ({
              key: String(sale.id),
              cells: [
                saleName(sale),
                formatPrice(sale.sale_price),
                fill(t('merchantToday'), { time: saleTime(sale.ends_at) }),
                people(sale.view_count),
                endButton(sale),
              ],
            }))}
          />
        )
      ) : (
        <ul className={s.list}>
          {f[status].data?.map((sale) => (
            <li key={sale.id} className={s.row}>
              <ItemTile itemId={sale.item_id} size={48} />
              <div className={s.rowBody}>
                <div className={s.rowLine}>
                  <span className={s.rowTitle}>{saleName(sale)}</span>
                  <span className={s.price}>{formatPrice(sale.sale_price)}</span>
                </div>
                <span className={s.rowSub}>
                  {status === 'active'
                    ? fill(t('merchantSaleSeen'), {
                        time: saleTime(sale.ends_at),
                        n: sale.view_count,
                      })
                    : fill(t('merchantSaleEnded'), { time: saleTime(sale.ends_at) })}
                </span>
              </div>
              {endButton(sale, status === 'ended')}
            </li>
          ))}
        </ul>
      )}
    </Resource>
  );

  const soldOut = extras && store && (
    <Section title={t('merchantItemsToday')}>
      <ul className={s.list}>
        {store.item_ids.map((id) => {
          const out = extras.sold_out_item_ids.includes(id);
          const name = itemName(id);
          return (
            <li key={id} className={s.row}>
              <ItemTile itemId={id} size={44} />
              <div className={s.rowBody}>
                <span className={s.rowTitle}>{name}</span>
                <span className={out ? s.soldOut : s.rowSub}>
                  {t(out ? 'merchantSoldOut' : 'merchantSelling')}
                </span>
              </div>
              <Toggle
                label={fill(t('merchantSellingLabel'), { item: name })}
                checked={!out}
                onChange={(on) => void f.soldOut.run(id, !on)}
              />
            </li>
          );
        })}
      </ul>
      <p className={s.help}>{t('merchantSoldOutHelp')}</p>
      {f.soldOut.error && <ErrorBox message={f.soldOut.error} />}
    </Section>
  );

  const links: { to: string; icon: IconName; title: string; end?: ReactNode }[] = [
    {
      to: '/merchant/store',
      icon: 'store',
      title: t('storeInfo'),
      end: store && fill(t('merchantHours'), store.hours),
    },
    // 가게 위치 저장은 백엔드가 없어 mock에서만(live는 extras가 null)
    ...(extras
      ? [
          {
            to: '/merchant/store/location',
            icon: 'pin' as IconName,
            title: t('merchantStorePin'),
            end: extras.location_confirmed ? (
              <Tag>{t('merchantPinDone')}</Tag>
            ) : (
              <Tag tone="todo">{t('merchantPinTodo')}</Tag>
            ),
          },
        ]
      : []),
    ...(desktop ? [] : [{ to: '/merchant/poster', icon: 'qr' as IconName, title: t('poster') }]),
  ];
  const linkList = (
    <ul className={s.list}>
      {links.map((l) => (
        <li key={l.to}>
          <Link to={l.to} className={s.linkRow}>
            <Icon name={l.icon} />
            <span>
              <span className={s.linkTitle}>{l.title}</span>
            </span>
            <span className={s.linkEnd}>
              {l.end}
              <Icon name="chevronRight" size={20} color="var(--color-muted)" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
  const ended = !!f.ended.data?.length && (
    <Section title={t('endedSales')}>{saleList('ended')}</Section>
  );
  const title = (
    <div className={s.titleBlock}>
      <h1 className={desktop ? s.webTitle : s.title}>{store?.name ?? auth.user?.store?.name}</h1>
      {market && <span className={s.subtitle}>{market}</span>}
    </div>
  );

  if (desktop)
    return (
      <>
        <RoleHeader
          role={t('meRoleMerchant')}
          name={[market, store?.name].filter(Boolean).join(' ')}
        />
        <div className={s.web}>
          <div className={s.webTop}>
            {title}
            <ButtonLink to="/merchant/poster" variant="outline" size="md" icon={<Icon name="qr" />}>
              {t('poster')}
            </ButtonLink>
          </div>
          {notice && (
            <p role="status" className={s.note}>
              <Icon name="check" size={20} />
              {notice}
            </p>
          )}
          {stats}
          <div className={s.cols}>
            <div className={s.colMain}>
              <MerchantPrices desktop />
              <Section title={t('activeSales')} gap={4}>
                {saleList('active')}
              </Section>
              {ended}
              {soldOut}
              {linkList}
            </div>
            <SaleForm
              key={formKey}
              variant="aside"
              onDone={() => {
                setFormKey((k) => k + 1);
                f.active.retry();
                f.store.retry();
              }}
            />
          </div>
          {f.action.error && <ErrorBox message={f.action.error} />}
        </div>
      </>
    );
  return (
    <>
      <AppHeader back="/me" end={<LogoutButton />} />
      <div className={s.main}>
        {title}
        {notice && (
          <p role="status" className={s.note}>
            <Icon name="check" size={20} />
            {notice}
          </p>
        )}
        <div className={`${s.heading} ${s.gap18}`}>{stats}</div>
        <ButtonLink to="/merchant/sale/new" variant="primary" wide icon={<Icon name="plus" />}>
          {t('postSale')}
        </ButtonLink>
        <Section title={t('activeSales')}>{saleList('active')}</Section>
        {f.action.error && <ErrorBox message={f.action.error} />}
        <MerchantPrices />
        {soldOut}
        {ended}
        {linkList}
      </div>
    </>
  );
}

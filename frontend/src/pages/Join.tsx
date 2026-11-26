import { useState, useCallback, type FormEvent } from 'react';
import * as api from '../api/marketRequests';
import { useResource, useAction } from '../hooks/useResource';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useCaptcha } from '../hooks/useCaptcha';
import Resource from '../components/common/Resource';
import Button from '../components/common/Button';
import ErrorBox from '../components/common/ErrorBox';
import Icon from '../components/common/Icon';
import { Chip, ChipRow } from '../components/common/Chip';
import { Field } from '../components/common/parts';
import AppHeader from '../components/layout/AppHeader';
import Captcha from '../components/domain/Captcha';
import { people } from '../utils/people';
import { useT } from '../i18n';
import type { Market, JoinRequest } from '../types/contract';
import { Footer } from './merchant/parts';
import { fill } from './merchant/format';
import s from './merchant/merchant.module.css';

const ORGS = ['상인회', '관리사무소', '기타'] as const;

function Demand({ market }: { market: Market }) {
  const t = useT();
  const demand = useResource(
    useCallback(() => api.getDemand(market.market_id), [market.market_id]),
  );
  return (
    <Resource state={demand}>
      {demand.data && (
        <div className={s.group}>
          <p className={s.note}>
            <Icon name="user" size={20} />
            {fill(t('joinRequests'), { n: people(demand.data.requests_7d) })}
          </p>
          <p className={s.help}>
            {fill(t('joinNearby'), { n: people(demand.data.nearby_7d) })}. {t('joinDemandBasis')}
          </p>
        </div>
      )}
    </Resource>
  );
}

// Join · WebJoin: 시장 입점 신청(상인회·관리사무소). 신청하면 운영팀 확인 뒤 시장 관리자 화면이 열림.
export default function Join() {
  const t = useT();
  const desktop = useIsDesktop();
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<Market | null>(null);
  const [org, setOrg] = useState<JoinRequest['manager_org']>('상인회');
  const search = useAction(api.searchMarkets);
  const action = useAction(api.join);
  const captcha = useCaptcha();
  const open = market && market.status !== 'active';
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!market) return;
    const data = new FormData(event.currentTarget);
    void action
      .run({
        market_id: market.market_id,
        manager_org: org,
        contact: String(data.get('contact')),
        login_id: String(data.get('login_id')),
        password: String(data.get('password')),
        ...(data.get('store_count') ? { store_count: Number(data.get('store_count')) } : {}),
        ...(data.get('note') ? { note: String(data.get('note')) } : {}),
        ...captcha.fields,
      })
      .then((r) => {
        if (!r) captcha.refresh();
      });
  };

  if (action.data)
    return (
      <>
        {!desktop && <AppHeader title={t('joinTitle')} back="/me" />}
        <div className={desktop ? `${s.web} ${s.inPage}` : s.main}>
          <div className={s.heading} role="status">
            <h1 className={desktop ? s.webTitle : s.title}>{t('joinDoneTitle')}</h1>
            <p className={s.lead}>{t('joinFooter')}</p>
          </div>
        </div>
      </>
    );

  const searchForm = (
    <form
      className={s.group}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        void search.run(query);
      }}
    >
      <div className={s.editForm}>
        <Field
          label={t('joinMarketName')}
          type="search"
          placeholder={t('joinSearchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ height: 54 }}
        />
        <Button type="submit" variant="surface" loading={search.loading}>
          {t('joinSearch')}
        </Button>
      </div>
      {search.error && <ErrorBox message={search.error} />}
      {search.data?.length === 0 && <p className={s.empty}>{t('joinNotFound')}</p>}
      {!!search.data?.length && (
        <ChipRow label={t('joinPickMarket')} wrap>
          {search.data.map((value) => (
            <Chip
              key={value.market_id}
              pressed={market?.market_id === value.market_id}
              onClick={() => setMarket(value)}
            >
              {value.name}
            </Chip>
          ))}
        </ChipRow>
      )}
    </form>
  );
  const optional = <span className={s.optional}>{t('joinOptional')}</span>;
  const credentials = (
    <>
      <Field
        label={t('loginId')}
        name="login_id"
        placeholder={t('meIdPlaceholder')}
        required
        pattern="[A-Za-z0-9_]{4,20}"
        autoComplete="username"
        style={{ height: 54 }}
      />
      <Field
        label={t('password')}
        name="password"
        type="password"
        placeholder={t('mePwPlaceholder')}
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        style={{ height: 54 }}
      />
    </>
  );
  const contact = (
    <Field
      label={t('joinContact')}
      name="contact"
      type="tel"
      placeholder="02-000-0000"
      required
      maxLength={80}
      hint={t('joinContactHelp')}
      style={{ height: 54 }}
    />
  );
  const count = (
    <div className={s.selectField}>
      <label htmlFor="join-count">
        {t('joinStoreCount')} {optional}
      </label>
      <input
        id="join-count"
        name="store_count"
        type="number"
        inputMode="numeric"
        min="0"
        max="2147483647"
        placeholder={t('joinStoreCountPlaceholder')}
        className={s.select}
      />
    </div>
  );
  const memo = (
    <div className={s.selectField}>
      <label htmlFor="join-note">
        {t('joinMemo')} {optional}
      </label>
      <input
        id="join-note"
        name="note"
        maxLength={200}
        placeholder={t('joinMemoPlaceholder')}
        className={s.select}
      />
    </div>
  );
  const fields = market && (
    <>
      <Demand key={market.market_id} market={market} />
      {open ? (
        <form id="join-form" className={`${s.section} ${s.gap22}`} onSubmit={submit}>
          <div className={s.group}>
            <span className={s.groupLabel}>{t('joinOrg')}</span>
            <ChipRow label={t('joinOrg')} wrap>
              {ORGS.map((value) => (
                <Chip key={value} pressed={org === value} onClick={() => setOrg(value)}>
                  {value}
                </Chip>
              ))}
            </ChipRow>
          </div>
          {desktop ? (
            <div className={s.grid2}>
              {contact}
              {count}
              {credentials}
            </div>
          ) : (
            <>
              {contact}
              {count}
              <div className={`${s.section} ${s.gap16}`}>{credentials}</div>
            </>
          )}
          {memo}
          <Captcha captcha={captcha} id="join-captcha" />
          {action.error && <ErrorBox message={action.error} />}
          {desktop && (
            <div>
              <Button type="submit" variant="primary" loading={action.loading}>
                {t('joinSubmit')}
              </Button>
            </div>
          )}
        </form>
      ) : (
        <p className={s.lead}>{t('joinActive')}</p>
      )}
    </>
  );

  if (desktop)
    return (
      <div className={`${s.web} ${s.inPage}`}>
        <div className={s.cols}>
          <div className={`${s.colMain} ${s.gap24}`}>
            <div className={s.heading}>
              <h1 className={s.webTitle}>{t('joinTitle')}</h1>
              <p className={s.webLead}>{t('joinLead')}</p>
            </div>
            {searchForm}
            {fields}
          </div>
          <aside className={s.aside}>
            <h2 className={s.h2}>{t('joinStepsTitle')}</h2>
            <ol className={s.list}>
              {([1, 2, 3, 4] as const).map((n) => (
                <li key={n} className={s.row}>
                  <span className={s.stepNum} aria-hidden="true">
                    {n}
                  </span>
                  <span className={s.rowBody}>
                    <span className={s.rowTitle}>{t(`joinStep${n}`)}</span>
                    <span className={s.rowSub}>{t(`joinStep${n}Sub`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    );
  return (
    <>
      <AppHeader title={t('joinTitle')} back="/me" />
      <div className={`${s.main} ${s.gap22} ${open ? s.withFooter : ''}`}>
        <p className={s.lead}>{t('joinLead')}</p>
        {searchForm}
        {fields}
      </div>
      {open && (
        <Footer sub={t('joinFooter')}>
          <Button type="submit" form="join-form" variant="primary" grow loading={action.loading}>
            {t('joinSubmit')}
          </Button>
        </Footer>
      )}
    </>
  );
}

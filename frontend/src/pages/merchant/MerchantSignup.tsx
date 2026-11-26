import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAction } from '../../hooks/useResource';
import { useMarkets } from '../../hooks/useMarkets';
import { useMarketMap } from '../../hooks/useMarketMap';
import { useCaptcha } from '../../hooks/useCaptcha';
import { useSession } from '../../store/session';
import Resource from '../../components/common/Resource';
import Button, { ButtonLink } from '../../components/common/Button';
import ErrorBox from '../../components/common/ErrorBox';
import Icon from '../../components/common/Icon';
import { Chip, ChipRow } from '../../components/common/Chip';
import { CategoryBadge, Field } from '../../components/common/parts';
import AppHeader from '../../components/layout/AppHeader';
import MapView, { type MapPin } from '../../components/map/MapView';
import Captcha from '../../components/domain/Captcha';
import { CATEGORY_LABELS, storeCategory } from '../../utils/category';
import { useT } from '../../i18n';
import { Footer, Progress } from './parts';
import { fill } from './format';
import a from '../account/account.module.css';
import s from './merchant.module.css';

// SignupMerchant: 1 내 점포 고르기 → 2 아이디·비밀번호(+live 캡차) → 3 승인 대기(Pending, /merchant).
export default function MerchantSignup() {
  const t = useT();
  const auth = useAuth();
  const navigate = useNavigate();
  const session = useSession();
  const markets = useMarkets();
  const active = useMemo(
    () => markets.data?.filter((m) => m.status === 'active') ?? [],
    [markets.data],
  );
  const [picked, setPicked] = useState('');
  const marketId =
    picked ||
    (active.some((m) => m.market_id === session.market?.market_id)
      ? session.market!.market_id
      : (active[0]?.market_id ?? ''));
  const market = active.find((m) => m.market_id === marketId);
  const map = useMarketMap(marketId);
  const [store, setStore] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [q, setQ] = useState('');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState('');
  const captcha = useCaptcha();
  const action = useAction(async () => {
    await auth.signup({
      login_id: id.trim().toLowerCase(),
      password,
      store_id: store,
      ...captcha.fields,
    });
    navigate('/merchant', { replace: true });
    return true;
  });
  const zoneName = (zone: string) => map.data?.zones.find((z) => z.id === zone)?.name;
  const list = (map.data?.stores ?? [])
    .filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'));
  const chosen = map.data?.stores.find((x) => x.store_id === store);

  if (auth.user?.role === 'merchant') return <Navigate to="/merchant" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (store) setStep(2);
      return;
    }
    if (password !== confirm) return setProblem(t('mePwMismatch'));
    setProblem('');
    void action.run().then((r) => {
      if (!r) captcha.refresh();
    });
  };

  const pins: MapPin[] = (map.data?.stores ?? [])
    .filter((x) => x.lat && x.lng)
    .map((x) => ({
      id: x.store_id,
      name: x.name,
      lat: x.lat!,
      lng: x.lng!,
      category: storeCategory(x, zoneName(x.zone_id)),
      state: x.store_id === store ? 'selected' : store ? 'dim' : 'default',
    }));

  const storeStep = (
    <>
      <div className={`${s.heading} ${s.gap16}`}>
        <Progress step={1} />
        <div className={s.heading}>
          <h1 className={`${s.title} ${s.title26}`}>{t('merchantPickStore')}</h1>
          {market && map.data && (
            <p className={s.lead}>
              {fill(t('merchantPickLead'), { market: market.name, n: map.data.stores.length })}
            </p>
          )}
        </div>
      </div>
      <Resource state={markets}>
        {active.length > 1 && (
          <ChipRow label={t('selectMarket')} wrap>
            {active.map((m) => (
              <Chip
                key={m.market_id}
                pressed={m.market_id === marketId}
                onClick={() => {
                  setPicked(m.market_id);
                  setStore('');
                }}
              >
                {m.name}
              </Chip>
            ))}
          </ChipRow>
        )}
      </Resource>
      <label className={s.searchBox}>
        <Icon name="search" />
        <span className="sr-only">{t('merchantStoreSearch')}</span>
        <input
          type="search"
          placeholder={t('merchantStoreSearch')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <Resource state={map}>
        {pins.length > 0 && (
          <div className={s.miniMap}>
            <MapView
              label={fill(t('merchantStoreMap'), { market: market?.name ?? '' })}
              boundary={map.data?.boundary}
              pins={pins}
              sample
              onSelect={(pinId, type) => type === 'pin' && setStore(pinId)}
            />
          </div>
        )}
        <fieldset className={`${s.section} ${s.fieldset}`}>
          <legend className="sr-only">{t('merchantPickStore')}</legend>
          {list.length === 0 && <p className={s.empty}>{t('merchantNoStore')}</p>}
          <div className={s.list}>
            {list.map((x) => {
              const category = storeCategory(x, zoneName(x.zone_id));
              return (
                <label key={x.store_id} className={s.radioRow}>
                  <CategoryBadge category={category} size={44} />
                  <span className={s.rowBody}>
                    <span className={s.rowTitle}>{x.name}</span>
                    <span className={s.rowSub}>
                      {category ? CATEGORY_LABELS[category] : zoneName(x.zone_id)}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="store"
                    value={x.store_id}
                    checked={store === x.store_id}
                    onChange={() => setStore(x.store_id)}
                  />
                  <span className={s.radioMark} aria-hidden="true">
                    {store === x.store_id && <Icon name="check" size={16} />}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Resource>
    </>
  );
  const accountStep = (
    <>
      <div className={`${s.heading} ${s.gap16}`}>
        <Progress step={2} />
        <div className={s.heading}>
          <h1 className={`${s.title} ${s.title26}`}>{t('merchantAccountTitle')}</h1>
          <p className={s.lead}>{fill(t('merchantAccountLead'), { store: chosen?.name ?? '' })}</p>
        </div>
      </div>
      <div className={a.fields}>
        <Field
          label={t('loginId')}
          placeholder={t('meIdPlaceholder')}
          autoComplete="username"
          required
          minLength={4}
          maxLength={20}
          pattern="[a-z0-9_]+"
          value={id}
          onChange={(e) => setId(e.target.value)}
          style={{ height: 54 }}
        />
        <Field
          label={t('password')}
          placeholder={t('mePwPlaceholder')}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ height: 54 }}
        />
        <Field
          label={t('mePwConfirm')}
          placeholder={t('mePwConfirmPlaceholder')}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirm && confirm !== password ? t('mePwMismatch') : undefined}
          style={{ height: 54 }}
        />
      </div>
      <Captcha captcha={captcha} id="merchant-captcha" />
      {(problem || action.error) && <ErrorBox message={problem || action.error} />}
    </>
  );
  return (
    <form onSubmit={submit}>
      <AppHeader title={t('merchantSignupTitle')} back="/signup" />
      <div className={`${s.main} ${s.gap18} ${s.withFooter}`}>
        {step === 1 ? storeStep : accountStep}
      </div>
      <Footer sub={step === 1 ? t('merchantPickFooter') : undefined}>
        {step === 1 ? (
          <ButtonLink to="/signup" variant="surface">
            {t('previous')}
          </ButtonLink>
        ) : (
          <Button variant="surface" onClick={() => setStep(1)}>
            {t('previous')}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          grow
          disabled={step === 1 && !store}
          loading={action.loading}
        >
          {step === 1 ? t('meNext') : t('signup')}
        </Button>
      </Footer>
    </form>
  );
}

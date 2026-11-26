import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { recommend } from '../../api/recommend';
import { useAction } from '../../hooks/useResource';
import { useRequireMarket } from '../../hooks/useFlows';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useT, type Key } from '../../i18n';
import { ButtonLink } from '../../components/common/Button';
import BrandLogo from '../../components/common/BrandLogo';
import { Chip } from '../../components/common/Chip';
import ErrorBox from '../../components/common/ErrorBox';
import Icon from '../../components/common/Icon';
import { IconButton } from '../../components/common/parts';
import Recipes from '../../components/domain/Recipes';
import { formatPrice } from '../../utils/formatPrice';
import type { RecommendRequest, RecommendResponse } from '../../types/contract';
import { RouteList, RouteMap } from './route';
import { routeHref, useShopRoute, type RouteState } from '../../hooks/useShopRoute';
import PlanCard from './PlanCard';
import s from './shop.module.css';

type Purpose = RecommendRequest['purpose'];
type Topic = 'purpose' | 'headcount' | 'budget';
type Answers = { purpose?: Purpose; headcount?: number; budget?: number };
type Entry =
  | { id: number; who: 'bot'; key: Key }
  | { id: number; who: 'me'; text: string }
  | { id: number; who: 'recipes' }
  | { id: number; who: 'plan'; plan: RecommendResponse };
/** 지금 아래에 보여 줄 빠른 답: 물어보는 조건, 구성 뒤 바꾸기, 실패 뒤 다시 시도 */
type Ask = Topic | 'after' | 'retry' | null;

const PURPOSES: Purpose[] = ['집밥', '선물', '모임'];
// 서버에는 한국어 값(집밥·선물·모임)을 보내고, 화면에는 고른 언어로(045)
const PURPOSE_KEY: Record<Purpose, Key> = {
  집밥: 'shopPurposeHome',
  선물: 'shopPurposeGift',
  모임: 'shopPurposeParty',
};
const HEADCOUNTS = [1, 2, 3, 4, 6, 8];
const BUDGETS = [10000, 20000, 30000, 50000, 100000];
const TOPICS: Topic[] = ['purpose', 'headcount', 'budget'];
const QUESTION: Record<Topic, Key> = {
  purpose: 'shopAskPurpose',
  headcount: 'shopAskHeadcount',
  budget: 'shopAskBudget',
};
const START: Entry[] = [
  { id: 0, who: 'bot', key: 'shopHello' },
  { id: 1, who: 'bot', key: 'shopAskPurpose' },
];
const manwon = (won: number) => `${won / 10000}만원`;
const people = (n: number) => `${n}명`;

/** 숫자 직접 넣기(인원·예산). 빠른 답 칩 옆에 붙음 */
function NumberReply({
  label,
  suffix,
  max,
  onSubmit,
}: {
  label: string;
  suffix: string;
  max: number;
  onSubmit: (value: number) => void;
}) {
  const t = useT();
  const id = useId();
  const [value, setValue] = useState('');
  const n = Number(value);
  const ok = n > 0 && n <= max;
  return (
    <form
      className={s.replyForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(n);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className={s.replyInputWrap}>
        <input
          id={id}
          className={s.replyInput}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('shopCustom')}
          value={n ? n.toLocaleString('ko-KR') : ''}
          onChange={(e) =>
            setValue(e.target.value.replace(/[^0-9]/g, '').slice(0, String(max).length))
          }
        />
        <span className={s.replySuffix} aria-hidden="true">
          {suffix}
        </span>
      </span>
      <button type="submit" className={s.replySend} disabled={!ok} aria-label={t('shopConfirm')}>
        <Icon name="check" size={20} />
      </button>
    </form>
  );
}

/**
 * 장바구니(/shop, 2026-11-27 요청으로 채팅 형식). 도우미가 용도 → 인원 → 예산을 차례로 묻고,
 * 답은 빠른 답 칩이나 직접 입력으로 해요. 구성은 도우미의 말풍선으로 보여 주고, 그 뒤 조건 하나만 바꿔 다시 짤 수 있어요.
 * PC는 왼쪽 대화, 오른쪽은 구성 전 레시피 · 구성 뒤 동선 지도.
 */
export default function Shop() {
  const t = useT();
  const ctx = useShoppingContext();
  const desktop = useIsDesktop();
  const ready = useRequireMarket();
  const action = useAction(recommend);
  const [entries, setEntries] = useState<Entry[]>(START);
  const [answers, setAnswers] = useState<Answers>({});
  const [ask, setAsk] = useState<Ask>('purpose');
  const nextId = useRef(START.length);
  const endRef = useRef<HTMLDivElement>(null);
  const repliesRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  let plan: RecommendResponse | undefined;
  let planId = -1;
  for (const e of entries)
    if (e.who === 'plan') {
      plan = e.plan;
      planId = e.id;
    }
  const recipesShown = entries.some((e) => e.who === 'recipes');
  const itemIds = plan?.items.map((i) => i.item_id) ?? [];
  const lines = plan?.items.map(({ item_id, name, quantity, unit_label }) => ({
    item_id,
    name,
    quantity,
    unit_label,
  }));
  const route = useShopRoute(desktop && plan ? (ctx.marketId ?? '') : '', itemIds, lines);

  // 새 말풍선이 생기면 끝까지 내리고, 키보드로 쓰는 손님을 위해 첫 빠른 답에 초점을 둠
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    repliesRef.current?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [entries.length, ask, action.loading]);

  if (!ready) return null;

  const id = () => nextId.current++;
  const compose = async (a: Answers) => {
    if (!ctx.marketId || !a.purpose || !a.headcount || !a.budget) return;
    setAsk(null);
    const result = await action.run({
      purpose: a.purpose,
      relation: '가족',
      budget: a.budget,
      headcount: a.headcount,
      market_id: ctx.marketId,
    });
    if (!result) {
      setAsk('retry');
      return;
    }
    setEntries((list) => [
      ...list,
      { id: id(), who: 'plan', plan: result },
      { id: id(), who: 'bot', key: 'shopAskAgain' },
    ]);
    setAsk('after');
  };
  const answer = (topic: Topic, value: Purpose | number, label: string) => {
    const next: Answers = { ...answers, [topic]: value };
    const missing = TOPICS.find((k) => next[k] == null);
    setAnswers(next);
    setEntries((list) => [
      ...list,
      { id: id(), who: 'me', text: label },
      ...(missing ? [{ id: id(), who: 'bot' as const, key: QUESTION[missing] }] : []),
    ]);
    if (missing) setAsk(missing);
    else void compose(next);
  };
  const change = (topic: Topic, label: string) => {
    setEntries((list) => [
      ...list,
      { id: id(), who: 'me', text: label },
      { id: id(), who: 'bot', key: QUESTION[topic] },
    ]);
    setAsk(topic);
  };
  const restart = () => {
    setEntries(START);
    setAnswers({});
    setAsk('purpose');
  };
  const showRecipes = () =>
    setEntries((list) => [
      ...list,
      { id: id(), who: 'me', text: t('shopRecipePick') },
      { id: id(), who: 'recipes' },
      { id: id(), who: 'bot', key: 'shopAskPurposeAfterRecipes' },
    ]);

  const planActions = (p: RecommendResponse) => {
    const ids = p.items.map((i) => i.item_id);
    const state: RouteState = {
      lines: p.items.map(({ item_id, name, quantity, unit_label }) => ({
        item_id,
        name,
        quantity,
        unit_label,
      })),
      total: p.total,
      budget: p.budget,
    };
    return (
      p.items.length > 0 && (
        <div className={s.actions}>
          {!desktop && (
            <ButtonLink
              variant="primary"
              wide
              to={routeHref(ctx.href('/shop/route'), ids)}
              state={state}
              icon={<Icon name="map" size={20} />}
            >
              {t('shopOnMap')}
            </ButtonLink>
          )}
          <ButtonLink wide to={ctx.href('/chat')}>
            {t('shopChat')}
          </ButtonLink>
        </div>
      )
    );
  };

  const replies = ask && (
    <div className={s.replies} ref={repliesRef} role="group" aria-label={t('shopReplies')}>
      {ask === 'purpose' && (
        <>
          {PURPOSES.map((p) => (
            <Chip key={p} onClick={() => answer('purpose', p, t(PURPOSE_KEY[p]))}>
              {t(PURPOSE_KEY[p])}
            </Chip>
          ))}
          {!desktop && !recipesShown && (
            <Chip icon={<Icon name="list" size={16} />} onClick={showRecipes}>
              {t('shopRecipePick')}
            </Chip>
          )}
        </>
      )}
      {ask === 'headcount' && (
        <>
          {HEADCOUNTS.map((n) => (
            <Chip key={n} onClick={() => answer('headcount', n, people(n))}>
              {people(n)}
            </Chip>
          ))}
          <NumberReply
            label={t('shopCustomHeadcount')}
            suffix="명"
            max={20}
            onSubmit={(n) => answer('headcount', n, people(n))}
          />
        </>
      )}
      {ask === 'budget' && (
        <>
          {BUDGETS.map((b) => (
            <Chip key={b} onClick={() => answer('budget', b, formatPrice(b))}>
              {manwon(b)}
            </Chip>
          ))}
          <NumberReply
            label={t('shopCustomBudget')}
            suffix="원"
            max={9_999_999}
            onSubmit={(n) => answer('budget', n, formatPrice(n))}
          />
        </>
      )}
      {ask === 'after' && (
        <>
          <Chip onClick={() => change('budget', t('shopChangeBudget'))}>
            {t('shopChangeBudget')}
          </Chip>
          <Chip onClick={() => change('headcount', t('shopChangeHeadcount'))}>
            {t('shopChangeHeadcount')}
          </Chip>
          <Chip onClick={() => change('purpose', t('shopChangePurpose'))}>
            {t('shopChangePurpose')}
          </Chip>
          <Chip icon={<Icon name="refresh" size={16} />} onClick={restart}>
            {t('shopRestart')}
          </Chip>
        </>
      )}
      {ask === 'retry' && (
        <>
          <Chip onClick={() => void compose(answers)}>{t('retry')}</Chip>
          <Chip onClick={restart}>{t('shopRestart')}</Chip>
        </>
      )}
    </div>
  );

  // 도우미 말풍선 묶음의 첫 줄에만 얼굴(로고)을 붙임
  const botRow = (key: number | string, head: boolean, body: ReactNode) => (
    <div key={key} className={s.botRow} data-head={head || undefined}>
      <span className={s.avatar} aria-hidden="true">
        {head && <BrandLogo kind="mark" alt="" className={s.avatarLogo} />}
      </span>
      {body}
    </div>
  );
  const lastIsMe = entries[entries.length - 1]?.who === 'me';

  const talk = (
    <div className={s.talk} role="log" aria-label={t('shopTalk')}>
      {entries.map((e, i) => {
        if (e.who === 'me')
          return (
            <p key={e.id} className={s.meMsg}>
              {e.text}
            </p>
          );
        const head = i === 0 || entries[i - 1].who === 'me';
        if (e.who === 'bot') return botRow(e.id, head, <p className={s.botMsg}>{t(e.key)}</p>);
        if (e.who === 'recipes')
          return botRow(
            e.id,
            head,
            <div className={s.botWide}>
              <p className={s.botMsg}>{t('shopRecipeIntro')}</p>
              <Recipes />
            </div>,
          );
        return botRow(
          e.id,
          head,
          <div className={s.botWide}>
            <PlanCard plan={e.plan} id={`plan-${e.id}`} />
            {planActions(e.plan)}
            {desktop && e.id === planId && e.plan.items.length > 0 && (
              <RouteList route={route} lines={lines} total={e.plan.total} />
            )}
          </div>,
        );
      })}
      {action.loading &&
        botRow(
          'typing',
          lastIsMe,
          <p className={s.botMsg} role="status">
            <span className={s.typing} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {t('shopComposing')}
          </p>,
        )}
      {ask === 'retry' &&
        action.error &&
        botRow('error', lastIsMe, <ErrorBox message={action.error} />)}
      {replies}
      <div ref={endRef} className={s.talkEnd} />
    </div>
  );

  const panel = (
    <>
      <div className={s.head}>
        <h1 className={s.h1}>{t('shopTitle')}</h1>
        {!desktop && <IconButton icon="user" label={t('shopMe')} round to="/me" />}
      </div>
      {talk}
    </>
  );

  if (!desktop) return <div className={s.page}>{panel}</div>;
  return (
    <div className={s.web}>
      <div className={s.webPanel}>{panel}</div>
      <section className={s.webMap} aria-label={t('shopRouteMap')}>
        {plan && route.located ? (
          <RouteMap route={route} label={t('shopRouteMap')} />
        ) : plan ? (
          <div className={`${s.webMap} ${s.webMapEmpty}`}>
            <p>{t('shopRouteNoLocation')}</p>
          </div>
        ) : (
          <div className={s.webRecipes}>
            <Recipes />
          </div>
        )}
      </section>
    </div>
  );
}

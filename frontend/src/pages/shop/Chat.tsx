import TranslationNotice from '../../components/domain/TranslationNotice';
import { Link } from 'react-router-dom';
import { useRequireMarket } from '../../hooks/useFlows';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useChat } from '../../hooks/useChat';
import { useT } from '../../i18n';
import AppHeader from '../../components/layout/AppHeader';
import Button from '../../components/common/Button';
import { Chip, ChipLink, ChipRow } from '../../components/common/Chip';
import ErrorBox from '../../components/common/ErrorBox';
import Icon from '../../components/common/Icon';
import ModelLabel from '../../components/domain/ModelLabel';
import { routeHref } from '../../hooks/useShopRoute';
import s from './shop.module.css';
import { useWaitSteps } from '../../hooks/useWaitSteps';

const examples = ['대파 냉동해도 돼요?', '4명 선물 3만원으로 구성해 줘', '사과 어디서 팔아요?'];

function Conversation({ marketId, itemId }: { marketId: string; itemId?: string }) {
  const t = useT();
  const ctx = useShoppingContext();
  const f = useChat(marketId, itemId);
  const waitLabels = [t('waitSearch'), t('waitOrganize'), t('waitWrite')];
  const waitStep = useWaitSteps(f.loading, waitLabels.length);
  return (
    <>
      <AppHeader
        title={t('askTitle')}
        end={
          <Button variant="text" disabled={f.loading} onClick={f.reset}>
            {t('shopNewChat')}
          </Button>
        }
      />
      <div className={s.chat} aria-live="polite">
        {f.entries.map((e, i) =>
          e.role === 'user' ? (
            <article key={i} className={s.bubbleMe} aria-label={t('shopMyQuestion')}>
              {e.content}
            </article>
          ) : (
            <article key={i} className={s.bubbleBot} aria-label={t('shopAnswer')}>
              {!!e.response?.tools.length && (
                <div className={s.tools}>
                  {e.response.tools.map((tool) => (
                    <span key={tool.name} className={s.tool}>
                      <Icon name="check" size={14} />
                      {tool.label}
                    </span>
                  ))}
                </div>
              )}
              <p>{e.content}</p>
              {e.response && <TranslationNotice {...e.response} />}
              {e.response && (
                <>
                  {e.response.items.length > 1 && (
                    <ChipRow>
                      <ChipLink
                        to={routeHref(
                          ctx.href('/shop/route'),
                          e.response.items.map((x) => x.item_id),
                        )}
                        icon={<Icon name="map" size={18} />}
                      >
                        {t('shopOnMap')}
                      </ChipLink>
                    </ChipRow>
                  )}
                  {e.response.items.map((item) => (
                    <div className={s.links} key={item.item_id}>
                      <Link
                        className="text-link"
                        to={ctx.href(`/items/${encodeURIComponent(item.item_id)}`)}
                      >
                        {t('shopItemResult').replace('{item}', item.name)}
                      </Link>
                      <Link className="text-link" to={ctx.href('/', { item: item.item_id })}>
                        {t('shopItemMap').replace('{item}', item.name)}
                      </Link>
                    </div>
                  ))}
                  {!!e.response.citations.length && (
                    <ul className={s.note} aria-label={t('askSources')}>
                      {e.response.citations.map((c, j) => (
                        <li key={j}>
                          {c.url ? (
                            <a
                              className="prose-link"
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c.title}
                            </a>
                          ) : (
                            c.title
                          )}
                          {c.publisher && ` (${c.publisher})`}
                          {c.draft && ` ${t('askDraft')}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ModelLabel model={e.response.model} />
                </>
              )}
            </article>
          ),
        )}
        {f.loading && <p role="status">{waitLabels[waitStep]}</p>}
        {f.error && <ErrorBox message={f.error} />}
      </div>
      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void f.send();
        }}
      >
        <div className={s.composerInner}>
          {!f.entries.length && (
            <ChipRow label={t('shopExamples')}>
              {examples.map((q) => (
                <Chip key={q} disabled={f.loading} onClick={() => void f.send(q)}>
                  {q}
                </Chip>
              ))}
            </ChipRow>
          )}
          <div className={s.inputRow}>
            <label htmlFor="chat-input" className="sr-only">
              {t('shopQuestion')}
            </label>
            <input
              id="chat-input"
              className={s.input}
              maxLength={500}
              value={f.input}
              disabled={f.loading}
              placeholder={t('shopQuestionPlaceholder')}
              aria-describedby="chat-count"
              onChange={(e) => f.setInput(e.target.value)}
            />
            <button
              type="submit"
              className={s.send}
              aria-label={t('shopSend')}
              disabled={f.loading || !f.input.trim()}
            >
              <Icon name="send" size={22} />
            </button>
          </div>
          <p className={`${s.note} ${s.center}`} id="chat-count">
            {t('shopChatNote')} {f.input.length}/500
          </p>
        </div>
      </form>
    </>
  );
}

/** 물어보기(/chat?market=&item=). 옛 주소의 item_id도 받음 */
export default function Chat() {
  const ctx = useShoppingContext();
  const ready = useRequireMarket();
  const itemId = ctx.itemId ?? ctx.params.get('item_id') ?? undefined;
  if (!ready || !ctx.marketId) return null;
  return (
    <Conversation key={`${ctx.marketId}:${itemId ?? ''}`} marketId={ctx.marketId} itemId={itemId} />
  );
}

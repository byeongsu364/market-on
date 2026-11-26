import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PriceBand, StoreCategory } from '../../types/contract';
import { BAND_LABELS } from '../../utils/priceBand';
import { categoryColor } from '../../utils/category';
import { itemImage, itemTint } from '../../utils/itemImage';
import Icon, { CategoryGlyph } from './Icon';
import s from './ui.module.css';

/** 묶음 제목 + 오른쪽 작은 행동 */
export function SectionHeader({
  title,
  sub,
  action,
  as: Tag = 'h2',
  id,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  as?: 'h2' | 'h3';
  id?: string;
}) {
  return (
    <div>
      <div className={s.sectionHeader}>
        <Tag className={s.sectionTitle} id={id}>
          {title}
        </Tag>
        {action && <span className={s.sectionAction}>{action}</span>}
      </div>
      {sub && <p className={s.sectionSub}>{sub}</p>}
    </div>
  );
}

/** 구분선으로 나눈 목록(카드로 싸지 않음) */
export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className={s.list} aria-label={label}>
      {children}
    </ul>
  );
}
export function ListRow({
  title,
  sub,
  start,
  end,
  to,
  onClick,
  chevron = !!to || !!onClick,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  start?: ReactNode;
  end?: ReactNode;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      {start}
      <span className={s.rowBody}>
        <span className={s.rowTitle}>{title}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
        {children}
      </span>
      {(end || chevron) && (
        <span className={s.rowEnd}>
          {end}
          {chevron && <Icon name="chevronRight" size={20} />}
        </span>
      )}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={s.row}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" className={s.row} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={s.row}>{body}</div>
      )}
    </li>
  );
}

/** 라벨 + 입력 + 도움말/오류. 실제 input + label */
export function Field({
  label,
  hint,
  error,
  suffix,
  hideLabel,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  suffix?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  const id_ = props.id ?? id;
  return (
    <div className={s.field}>
      <label htmlFor={id_} className={hideLabel ? 'sr-only' : s.fieldLabel}>
        {label}
      </label>
      <span className={s.inputWrap}>
        <input
          {...props}
          id={id_}
          className={s.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id_}-d` : undefined}
          style={suffix ? { paddingRight: 48, ...props.style } : props.style}
        />
        {suffix && <span className={s.inputSuffix}>{suffix}</span>}
      </span>
      {(error || hint) && (
        <span id={`${id_}-d`} className={error ? s.fieldError : s.fieldHint}>
          {error || hint}
        </span>
      )}
    </div>
  );
}

/** 검색창(회색 면). 지도 위에서는 SearchPill 대신 화면이 감쌈 */
export function SearchBar({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={s.search}>
      <Icon name="search" size={20} />
      <span className="sr-only">{label}</span>
      <input type="search" {...props} className={s.searchInput} />
    </label>
  );
}

/** 하나만 고르는 면 버튼 묶음 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={s.segment}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 밑줄 탭(시트의 점포·마감세일·제철과 시세) */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={s.tab}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={s.toggle}
      onClick={() => onChange(!checked)}
    >
      <span className={s.toggleTrack} />
      <span className={s.toggleThumb} />
    </button>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 99,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  format?: (v: number) => string;
}) {
  return (
    <span className={s.stepper} role="group" aria-label={label}>
      <button
        type="button"
        className={s.stepperButton}
        aria-label={`${label} 줄이기`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="minus" size={20} />
      </button>
      <span className={s.stepperValue} aria-live="polite">
        {format(value)}
      </span>
      <button
        type="button"
        className={s.stepperButton}
        aria-label={`${label} 늘리기`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="plus" size={20} />
      </button>
    </span>
  );
}

/** 네 칸 가격 눈금. band가 null이면 모두 끔 */
export function PriceGauge({
  band,
  dark,
  label,
}: {
  band: PriceBand | null;
  dark?: boolean;
  label?: string;
}) {
  return (
    <div
      className={[s.gauge, dark ? s.gaugeDark : ''].join(' ')}
      role="img"
      aria-label={
        label ??
        (band
          ? `기준시세와 견준 가격 자리: ${BAND_LABELS[band - 1]}`
          : '기준시세가 없어 비교하지 않아요')
      }
    >
      <span className={s.gaugeBar} />
      <span className={s.gaugeCells}>
        {BAND_LABELS.map((name, i) => (
          <span key={name} className={s.gaugeCell} data-on={band === i + 1}>
            <span className={s.gaugeFill} />
            <span className={s.gaugeLabel}>{name}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
/** 목록용 작은 눈금(5×14px 네 칸) */
export function MiniGauge({ band }: { band: PriceBand | null }) {
  return (
    <span
      className={s.mini}
      role="img"
      aria-label={band ? `가격 자리: ${BAND_LABELS[band - 1]}` : '비교 없음'}
    >
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={s.miniCell} data-on={band === i} />
      ))}
    </span>
  );
}

/** 품목 그림을 옅은 판 위에(판 = 그림의 1.5배, 모서리 30%). 그림이 없으면 판만 */
export function ItemTile({
  itemId,
  varietyId,
  size = 44,
}: {
  itemId?: string | null;
  varietyId?: string | null;
  size?: number;
}) {
  const src = itemImage(itemId, varietyId);
  return (
    <span
      className={s.itemTile}
      style={{ width: size, height: size, background: itemTint(itemId, varietyId) }}
      aria-hidden="true"
    >
      {src && <img src={src} alt="" width={size / 1.5} height={size / 1.5} />}
    </span>
  );
}

/** 카테고리 색 11% 면 + 같은 색 아이콘 */
export function CategoryBadge({
  category,
  size = 40,
}: {
  category: StoreCategory | null;
  size?: number;
}) {
  const color = categoryColor(category);
  return (
    <span
      className={s.categoryBadge}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 11%, transparent)`,
      }}
      aria-hidden="true"
    >
      {category ? (
        <CategoryGlyph category={category} size={size * 0.55} color={color} />
      ) : (
        <Icon name="store" size={size * 0.55} color={color} />
      )}
    </span>
  );
}

/** 아이콘만 있는 둥근 버튼(aria-label 필수) */
export function IconButton({
  icon,
  label,
  onClick,
  round,
  to,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onClick?: () => void;
  round?: boolean;
  to?: string;
}) {
  const cls = [s.iconButton, round ? s.iconButtonRound : ''].join(' ');
  return to ? (
    <Link to={to} aria-label={label} className={cls}>
      <Icon name={icon} />
    </Link>
  ) : (
    <button type="button" aria-label={label} className={cls} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

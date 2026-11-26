import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { Tag } from '../../components/common/Chip';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../i18n';
import a from '../account/account.module.css';
import s from './merchant.module.css';

/** PC 머리말(WebMerchant·WebMarketAdmin·WebAdmin): 로고, 역할 꼬리표, 이름, 로그아웃 */
export function RoleHeader({ role, name }: { role: string; name?: ReactNode }) {
  const t = useT();
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <header className={s.roleHeader}>
      <Link to="/" className={s.roleLogo} aria-label="Market-On 지도 홈">
        <img src="/brand/logo-light.svg" alt="" />
      </Link>
      <Tag>{role}</Tag>
      <div className={s.roleEnd}>
        {name && <span className={s.roleName}>{name}</span>}
        <button
          type="button"
          className={s.roleLogout}
          onClick={() => void auth.logout().then(() => navigate('/login'))}
        >
          <Icon name="logout" size={20} />
          {t('logout')}
        </button>
      </div>
    </header>
  );
}

/** 모바일 머리말 끝의 로그아웃 아이콘 버튼 */
export function LogoutButton() {
  const t = useT();
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label={t('logout')}
      onClick={() => void auth.logout().then(() => navigate('/login'))}
      className={s.iconEnd}
    >
      <Icon name="logout" />
    </button>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className={s.stat}>
      <span className={s.statNum}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  );
}

/** 단계 표시(3칸) */
export function Progress({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className={s.progress} role="img" aria-label={`${total}단계 중 ${step}단계`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} data-on={i < step} />
      ))}
    </div>
  );
}

/** 아래 고정 버튼 자리(모바일) */
export function Footer({
  children,
  sub,
  className,
}: {
  children: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${a.footer} ${className ?? ''}`}>
      <div className={a.footerInner}>
        <div className={s.footerRow}>{children}</div>
        {sub && <span className={s.footerSub}>{sub}</span>}
      </div>
    </div>
  );
}

export function Section({
  title,
  id,
  children,
  gap = 0,
}: {
  title: ReactNode;
  id?: string;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <section className={s.section} style={{ gap }} aria-labelledby={id}>
      <div className={s.sectionHead}>
        <h2 className={s.h2} id={id}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** PC 표. 1024px 미만에서는 가로로 밀어 봄 */
export function DataTable({
  head,
  rows,
  minWidth = 560,
  empty,
}: {
  head: string[];
  rows: { key: string; cells: ReactNode[] }[];
  minWidth?: number;
  empty?: string;
}) {
  if (!rows.length && empty) return <p className={s.empty}>{empty}</p>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table} style={{ minWidth }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import Icon from '../common/Icon';
import s from './layout.module.css';

// 모바일 화면 머리말: 뒤로 + 제목(17px). back이 문자열이면 그 주소로, 없으면 이전 화면으로.
export default function AppHeader({
  title,
  back,
  end,
  hideBack,
}: {
  title?: ReactNode;
  back?: string;
  end?: ReactNode;
  hideBack?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <header className={s.appHeader}>
      <div className={s.appHeaderRow}>
        {!hideBack && (
          <button
            type="button"
            className={s.back}
            aria-label="뒤로"
            onClick={() =>
              back ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate('/')
            }
          >
            <Icon name="back" />
          </button>
        )}
        {title && <h1 className={s.appTitle}>{title}</h1>}
        {end}
        <NotificationBell />
      </div>
    </header>
  );
}

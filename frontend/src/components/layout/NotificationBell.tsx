import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../store/auth';
import { getNotifications } from '../../api/favorites';
import Icon from '../common/Icon';
import s from './layout.module.css';
export default function NotificationBell() {
  const user = useContext(AuthContext)?.user;
  const [unread, setUnread] = useState({ userId: '', count: 0 });
  const count = unread.userId === user?.id ? unread.count : 0;
  useEffect(() => {
    if (user?.role !== 'customer') return;
    let active = true;
    const refresh = () => {
      void getNotifications(true)
        .then((n) => {
          if (active) setUnread({ userId: user.id, count: n.length });
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('notifications:changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('notifications:changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [user]);
  return user?.role === 'customer' ? (
    <Link
      className={s.notificationBell}
      to="/me/notifications"
      aria-label={`알림 ${count}개 안 읽음`}
    >
      <Icon name="bell" />
      {count > 0 && <span className={s.notificationCount}>{count > 99 ? '99+' : count}</span>}
    </Link>
  ) : null;
}

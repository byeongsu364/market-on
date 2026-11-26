import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../../components/layout/AppHeader';
import Resource from '../../components/common/Resource';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useAuth } from '../../hooks/useAuth';
import { useResource } from '../../hooks/useResource';
import {
  getNotifications,
  readNotification,
  readAllNotifications,
  safeNoticeUrl,
} from '../../api/favorites';
export default function Notifications() {
  const { user } = useAuth();
  const desktop = useIsDesktop();
  const [error, setError] = useState('');
  const notices = useResource(
    useCallback(
      () => (user?.role === 'customer' ? getNotifications() : Promise.resolve([])),
      [user],
    ),
  );
  return (
    <>
      {!desktop && <AppHeader title="알림함" back="/me" />}
      <div className="page">
        <h1>알림함</h1>
        {user?.role !== 'customer' ? (
          <Link to="/login?next=%2Fme%2Fnotifications">손님 로그인</Link>
        ) : (
          <>
            <button
              onClick={() => {
                void readAllNotifications()
                  .then(() => {
                    setError('');
                    notices.retry();
                    window.dispatchEvent(new Event('notifications:changed'));
                  })
                  .catch(() => setError('알림을 읽음 처리하지 못했어요. 다시 시도해 주세요.'));
              }}
            >
              모두 읽음
            </button>
            {error && <p role="alert">{error}</p>}
            <Resource state={notices}>
              <ul>
                {notices.data?.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={safeNoticeUrl(n.url)}
                      onClick={() => {
                        void readNotification(n.id)
                          .then(() => window.dispatchEvent(new Event('notifications:changed')))
                          .catch(() => setError('알림을 읽음 처리하지 못했어요.'));
                      }}
                    >
                      {!n.read_at && <span aria-label="안 읽음">● </span>}
                      <strong>{n.title}</strong>
                      <p>{n.body}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              {!notices.data?.length && <p>아직 알림이 없어요.</p>}
            </Resource>
          </>
        )}
      </div>
    </>
  );
}

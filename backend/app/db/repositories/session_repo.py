"""Only SHA256 digests cross the session persistence boundary."""

from ._operational import rows


def create(conn, digest, user_id, expires_at):
    conn.execute(
        'insert into sessions(id,user_id,expires_at) values(%s,%s,%s)',
        (digest, user_id, expires_at),
    )


def get(conn, digest, now):
    result = rows(
        conn,
        'update sessions set last_seen_at=%s where id=%s and expires_at>%s returning user_id',
        (now, digest, now),
    )
    return result[0] if result else None


def delete(conn, digest):
    conn.execute('delete from sessions where id=%s', (digest,))


def delete_for_user(conn, user_id):
    """승인 취소·거절·비활성 시 그 사용자의 모든 로그인을 즉시 끊음."""
    conn.execute('delete from sessions where user_id=%s', (user_id,))


def purge_expired(conn, user_id, now):
    conn.execute('delete from sessions where user_id=%s and expires_at<=%s', (user_id, now))

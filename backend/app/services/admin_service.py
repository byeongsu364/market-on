"""Shared merchant approval transitions, serialized per store."""

from app.core.errors import AppError
from app.db.repositories import user_repo, session_repo, store_repo
from .auth_service import public_user


def merchants(conn, status):
    return [
        public_user(conn, u) | {'created_at': u['created_at']}
        for u in user_repo.list_merchants(conn, status)
    ]


def set_status(conn, operator, user_id, status):
    with conn.transaction():
        user = user_repo.get(conn, user_id)
        if not user or user['role'] != 'merchant':
            raise AppError('USER_NOT_FOUND', '상인을 찾을 수 없습니다.', 404)
        if operator['role'] == 'market_admin':
            store = store_repo.get_store(conn, user['store_id'])
            if not store or store['market_id'] != operator['market_id']:
                raise AppError('USER_NOT_FOUND', '상인을 찾을 수 없습니다.', 404)
        user_repo.lock_store(conn, user['store_id'])
        user = user_repo.get(conn, user_id, lock=True)
        if status == 'approved' and user_repo.store_taken(conn, user['store_id'], user_id):
            raise AppError('STORE_TAKEN', '이미 승인된 상인이 있는 점포입니다.', 409)
        return public_user(conn, transition_account(conn, operator, user_id, status))


def transition_account(conn, operator, user_id, status):
    updated = user_repo.set_status(conn, user_id, status, operator['id'])
    if status in ('rejected', 'disabled'):
        session_repo.delete_for_user(conn, user_id)
    return updated


def market_admins(conn):
    return [
        public_user(conn, u) | {'created_at': u['created_at']}
        for u in user_repo.list_market_admins(conn)
    ]


def disable_market_admin(conn, operator, user_id):
    with conn.transaction():
        user = user_repo.get(conn, user_id, lock=True)
        if not user or user['role'] != 'market_admin':
            raise AppError('USER_NOT_FOUND', '시장 관리자를 찾을 수 없습니다.', 404)
        updated = transition_account(conn, operator, user_id, 'disabled')
        return public_user(conn, updated)

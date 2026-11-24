"""Anonymous demand and atomic market onboarding."""

from app.core.errors import AppError
from app.db.repositories import market_request_repo as repo, store_repo
from . import auth_service, admin_service
from .price_report_service import hash_device


def market(conn, mid, lock=False):
    value = repo.lock_market(conn, mid) if lock else store_repo.get_market(conn, mid)
    if not value:
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    return value


def listed(value):
    if value['status'] != 'listed':
        raise AppError('MARKET_ACTIVE', '이미 이용할 수 있는 시장입니다.', 409)


def demand(conn, mid):
    value = market(conn, mid)
    counts = {v['kind']: v['count'] for v in repo.demand(conn, mid)}
    nearby, requests = counts.get('nearby', 0), counts.get('request', 0)
    return dict(
        market_id=mid,
        name=value['name_ko'],
        status=value['status'],
        nearby_7d=nearby if nearby >= 5 else None,
        requests_7d=requests if requests >= 5 else None,
        low=nearby < 5 or requests < 5,
    )


def request(conn, mid, device):
    with conn.transaction():
        listed(market(conn, mid, True))
        repo.record(conn, mid, hash_device(device), 'request')
        return dict(requested=True, requests_7d=demand(conn, mid)['requests_7d'])


def join(conn, data):
    with conn.transaction():
        listed(market(conn, data.market_id, True))
        if repo.pending(conn, data.market_id):
            raise AppError('APPLICATION_PENDING', '이미 확인 중인 입점 신청이 있습니다.', 409)
        user = auth_service.create_market_admin(
            conn, data.login_id, data.password.get_secret_value(), data.market_id, pending=True
        )
        return application(conn, repo.create(conn, data, user['id']))


def application(conn, value):
    return value | {'demand': demand(conn, value['market_id'])}


def applications(conn, status):
    return [application(conn, v) for v in repo.applications(conn, status)]


def review(conn, operator, aid, status):
    with conn.transaction():
        value = repo.get(conn, aid, True)
        if not value:
            raise AppError('APPLICATION_NOT_FOUND', '신청을 찾을 수 없습니다.', 404)
        if value['status'] != 'pending':
            raise AppError('APPLICATION_REVIEWED', '이미 확인한 신청입니다.', 409)
        if status == 'approved':
            repo.activate(conn, value['market_id'])
        if value['admin_user_id']:
            admin_service.transition_account(conn, operator, value['admin_user_id'], status)
        return application(conn, repo.review(conn, aid, status, operator['id']))

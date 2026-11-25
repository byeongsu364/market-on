"""Market manager reads; approval transitions live in admin_service."""

from urllib.parse import urlencode
from app.db.repositories import market_admin_repo, user_repo, store_repo
from .auth_service import public_user


def market(conn, user):
    return market_admin_repo.summary(conn, user['market_id'])


def merchants(conn, user, status):
    result = []
    for merchant in user_repo.scoped_merchants(conn, status, user['market_id']):
        value = public_user(conn, merchant)
        result.append(
            {key: value[key] for key in ('id', 'login_id', 'status')}
            | {
                'created_at': merchant['created_at'],
                'store': {key: value['store'][key] for key in ('store_id', 'name')},
            }
        )
    return result


def poster(conn, user, origin):
    market = store_repo.get_market(conn, user['market_id'])
    return {
        'market_name': market['name_ko'],
        'url': origin.rstrip('/') + '/?' + urlencode({'market': user['market_id']}),
    }

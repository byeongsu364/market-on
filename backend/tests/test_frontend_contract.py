"""HTTP responses expose precisely the frontend contract keys, without DB internals."""

from tests.test_merchant_api import merchant, sale_payload
from tests.test_auth_api import memory, signup, operator, HEADER

USER = {'id', 'login_id', 'role', 'status', 'store'}
STORE = {'store_id', 'name', 'market_id', 'hours', 'item_ids', 'today_views', 'sale_views'}
SALE = {'id', 'store_id', 'item_id', 'sale_price', 'starts_at', 'ends_at', 'status', 'view_count'}
ITEM = {
    'item_id',
    'name',
    'synonyms',
    'vision_labels',
    'criteria',
    'default_unit',
    'units',
    'labels_i18n',
}


def assert_sale(s, public=False):
    assert set(s) - {'regular_price', 'unit_id'} == SALE | (
        {'store_name', 'item_name'} if public else set()
    )
    assert isinstance(s['view_count'], int)


def test_auth_admin_contract(memory):
    client = memory['client']
    response = signup(memory)
    user = response.json()['user']
    assert set(user) == USER
    assert set(user['store']) == {'store_id', 'name', 'market_id'}
    assert set(client.get('/auth/me').json()['user']) == USER
    operator(memory)
    pending = client.get('/admin/merchants').json()[0]
    assert set(pending) == USER | {'created_at'}
    for action in ('approve', 'reject', 'disable'):
        response = client.post(f'/admin/merchants/{user["id"]}/{action}', headers=HEADER)
        assert set(response.json()['user']) == USER


def test_store_sale_poster_contract(merchant):
    client = merchant['client']
    assert set(client.get('/merchant/store').json()) == STORE
    assert set(client.patch('/merchant/store', headers=HEADER, json={}).json()) == STORE
    created = client.post('/merchant/sales', headers=HEADER, json=sale_payload()).json()
    assert_sale(created)
    assert_sale(client.get('/merchant/sales').json()[0])
    assert_sale(client.get('/sales/active').json()[0], public=True)
    page = client.get('/stores/store:a').json()
    assert set(page) == {'store', 'items', 'sales'}
    assert set(page['store']) == STORE
    assert set(page['items'][0]) == ITEM
    assert_sale(page['sales'][0], public=True)
    assert set(client.get('/merchant/poster').json()) == {'store_name', 'market_name', 'url'}
    assert_sale(client.post(f'/merchant/sales/{created["id"]}/end', headers=HEADER).json())
    repost = client.post(
        f'/merchant/sales/{created["id"]}/repost',
        headers=HEADER,
        json={'ends_at': '2026-11-24T22:00:00+09:00'},
    ).json()
    assert_sale(repost)

"""Offline sbiz loading: never accesses an API or database."""

from contextlib import nullcontext
from copy import deepcopy
from unittest.mock import Mock
import yaml
import pytest
from scripts import load_market_stores as loader
from app.db.repositories import store_repo


@pytest.fixture
def config():
    return yaml.safe_load((loader.DATA / 'markets/gyeongdong.yaml').read_text())


def fixture_rows():
    return [
        dict(
            bizesId=str(i),
            bizesNm=f'고정상호{i}',
            indsSclsNm=industry,
            bldNm=building,
            rdnmAdr=address,
            flrNo='1',
            lon=127.04,
            lat=37.58,
        )
        # 실제 응답처럼 같은 건물이 "본관"·"신관"·빈칸으로 적혀 있음 → 도로명 주소로 고름
        for i, (industry, building, address) in enumerate(
            [
                ('채소/과일 소매업', '본관', '서울특별시 동대문구 고산자로36길 3'),
                ('건어물/젓갈 소매업', '', '서울특별시 동대문구 고산자로36길 3'),
                ('약국', '경동시장', '서울특별시 동대문구 고산자로36길 3'),
                ('채소/과일 소매업', '다른건물', '서울특별시 동대문구 고산자로36길 30'),
            ]
        )
    ]


def test_prepare_filters_and_determinism(config):
    rows = fixture_rows()
    first = loader.prepare(config, rows)
    assert first == loader.prepare(config, list(reversed(rows)))
    market, zones, stores, guesses, report = first
    assert market['at_mrkt_cd'] == '0110212'
    assert (market['lat'], market['lng']) == (37.58, 127.04)
    assert len(stores) == len(zones) == 2
    assert stores[1]['store_category_id'] == 'store_category:produce'
    assert 'item:green_onion' in guesses['store:gd-0']
    assert guesses['store:gd-1'] == []
    assert report['stores'] == 2
    loader.load_market_stores(None, config, rows, dry_run=True)


def test_load_repeated_and_missing_preserves_merchant(config, monkeypatch):
    markets, zones, stores, items = {}, {}, {}, {('store:gd-0', 'item:onion'): 'merchant'}
    for name, target in [
        ('upsert_market', markets),
        ('upsert_zone', zones),
        ('upsert_store', stores),
    ]:
        monkeypatch.setattr(
            store_repo, name, lambda c, _target=target, **v: _target.update({v['id']: v})
        )

    # Exercise actual repository SQL semantics against an in-memory interpreter.
    class Conn:
        transaction = staticmethod(nullcontext)

        def execute(self, sql, args):
            if sql.startswith('delete from store_items'):
                for key, source in list(items.items()):
                    if key[0] == args[0] and source == 'sbiz_guess':
                        del items[key]
            elif sql.startswith('insert into store_items'):
                items.setdefault(tuple(args), 'sbiz_guess')
            elif sql.startswith('update stores'):
                for store in stores.values():
                    if store['id'] not in args[1]:
                        store['active'] = False
            else:
                raise AssertionError(sql)

    conn = Conn()
    rows = fixture_rows()
    loader.load_market_stores(conn, config, rows)
    snapshot = deepcopy((markets, zones, stores, items))
    loader.load_market_stores(conn, config, rows)
    assert snapshot == (markets, zones, stores, items)
    assert items[('store:gd-0', 'item:onion')] == 'merchant'
    loader.load_market_stores(conn, config, rows[1:])
    assert not stores['store:gd-0']['active']
    assert stores['store:gd-1']['active']


def test_pagination_and_failure(config, monkeypatch):
    pages = [
        dict(header=dict(resultCode='00'), body=dict(items=[r], totalCount=2))
        for r in fixture_rows()[:2]
    ]
    get = Mock(side_effect=[Mock(json=lambda p=p: p) for p in pages])
    monkeypatch.setattr(loader.http, 'get_sync', get)
    monkeypatch.setattr(loader.settings, 'DATA_GO_KR_KEY', 'fixture-key')
    assert len(loader.fetch_rows(config)) == 2
    assert get.call_args_list[1].kwargs['params']['pageNo'] == 2
    monkeypatch.setattr(
        loader.http,
        'get_sync',
        Mock(return_value=Mock(json=lambda: dict(header=dict(resultCode='99')))),
    )
    with pytest.raises(loader.AppError):
        loader.fetch_rows(config)


from tests.test_items_markets_api import public


def test_map_provenance(public, monkeypatch):
    client, markets, stores = public
    stores['store:demo-A05']['source'] = 'sbiz'
    original = store_repo.market_items
    monkeypatch.setattr(
        store_repo, 'market_items', lambda *a: [r | {'source': 'sbiz_guess'} for r in original(*a)]
    )
    result = client.get('/markets/market:demo/map').json()
    assert result['layout'] == 'schematic'
    assert result['source_note'] == '소상공인 상가정보 2026-09 기준'
    store = next(s for s in result['stores'] if s['store_id'] == 'store:demo-A05')
    assert store['items_basis'] == 'sbiz_guess'
    assert 'item:green_onion' in store['guessed_item_ids']


def test_empty_snapshot_and_dry_run_no_writes(config, monkeypatch):
    mutations = Mock()
    monkeypatch.setattr(store_repo, 'upsert_market', mutations)
    conn = Mock(transaction=Mock(side_effect=nullcontext))
    loader.load_market_stores(conn, config, fixture_rows(), dry_run=True)
    mutations.assert_not_called()
    conn.transaction.assert_not_called()
    assert loader.prepare(config, [])[2] == []


def test_large_grid_no_overlap(config):
    rows = [fixture_rows()[0] | dict(bizesId=str(i), bizesNm=f'상호{i:03}') for i in range(60)]
    rows += [fixture_rows()[1] | {'bizesId': 'dried'}]
    stores = loader.prepare(config, rows)[2]
    positions = [(s['map_x'], s['map_y']) for s in stores]
    assert len(set(positions)) == len(positions)
    for i, (x, y) in enumerate(positions):
        assert all(abs(x - xx) >= 72 or abs(y - yy) >= 54 for xx, yy in positions[i + 1 :])

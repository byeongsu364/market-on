"""개발 DB에만 예시 시세를 생성합니다. 실제 조사값이 아닙니다."""

import argparse
from datetime import date, timedelta

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

from app.core.config import settings
from app.db.repositories.price_repo import OBSERVATION_FIELDS, upsert_observations

# 예시 값: 품종별 고정 배수이며 실제 조사·품질·가치와 관계없습니다.
MULTIPLIERS = {
    'variety:pear-noksu': 0.85,
    'variety:pear-hanareum': 0.95,
    'variety:pear-manpung': 1.25,
    'variety:sweet_persimmon-gampung': 1.15,
    'variety:sweet_persimmon-romang': 1.10,
    'variety:sweet_persimmon-jowan': 0.90,
    'variety:onion-jangilhwang': 1.10,
    'variety:onion-highland': 1.20,
    'variety:green_onion-cold': 1.10,
    'variety:green_onion-warm': 0.90,
    # 노지 예시 행도 만들되 기본 품종 조회·이력·합계는 이 행을 항상 제외합니다.
    'variety:mandarin-open': 1.00,
    'variety:mandarin-greenhouse': 1.25,
}


def seed(conn, *, remove=False, today=None):
    with conn.transaction():
        deleted = conn.execute("delete from price_observations where source='mock'").rowcount
        if remove:
            return {'deleted': deleted, 'inserted': 0}
        today = today or date.today()
        rows = []
        for variety, multiplier in MULTIPLIERS.items():
            item = 'item:' + variety.split(':')[1].split('-')[0]
            # upsert_observations는 기본(튜플) 행을 쓰므로 사전 행은 이 조회 커서에서만
            base = (
                conn.cursor(row_factory=dict_row)
                .execute(
                    """select p.* from price_observations p
                join entity_relations r on r.subject_id=p.item_id
                and r.object_id=p.variety_id and r.predicate='hasGrade'
                and r.props->>'default'='true'
                where p.item_id=%s and p.source='at_period_retail' and p.exmn_ymd between %s and %s""",
                    (item, today - timedelta(days=34), today),
                )
                .fetchall()
            )
            for original in base:
                row = {k: v for k, v in original.items() if k in OBSERVATION_FIELDS}
                row.update(
                    source='mock',
                    variety_id=variety,
                    vrty_cd=variety,
                    vrty_nm='예시 · 실제 조사값 아님',
                    price=round(original['price'] * multiplier),
                )
                rows.append(row)
        inserted, _ = upsert_observations(conn, rows)
        return {'deleted': deleted, 'inserted': inserted}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--remove', action='store_true')
    parser.add_argument(
        '--allow-db',
        help='개발용 DB 이름을 직접 적어 허용 (예: 로컬 개발 DB가 marketon이면 --allow-db marketon)',
    )
    args = parser.parse_args()
    url = settings.DATABASE_URL
    db = conninfo_to_dict(url or '').get('dbname', '')
    # 연결하기 전에 거부: 이름이 다르거나 불분명한 DB는 열지 않아요. 직접 적은 이름과 정확히 같을 때만 허용
    if db not in {'marketon_dev', 'marketon_test'} and not (args.allow_db and args.allow_db == db):
        raise SystemExit(
            'marketon_dev·marketon_test이거나 --allow-db로 이름을 직접 적은 개발용 DB만 허용합니다.'
        )
    with psycopg.connect(url) as conn:
        print(seed(conn, remove=args.remove))


if __name__ == '__main__':
    main()

"""SQL 마이그레이션 적용. 연결은 app.db.pool을 재사용합니다."""

import argparse
from pathlib import Path
import sys

from app.core.errors import AppError
from app.db.pool import close_pool
from app.db import migrations

MIGRATIONS = Path(__file__).resolve().parents[1] / 'migrations'


def migrate(dry_run: bool = False) -> None:
    applied = migrations.applied_versions()
    pending = [path for path in sorted(MIGRATIONS.glob('*.sql')) if path.name not in applied]
    if dry_run:
        for path in pending:
            print(path.name)
        return
    migrations.ensure_history()
    for path in pending:
        migrations.apply(path.name, path.read_text(encoding='utf-8'))
        print(f'적용 완료: {path.name}')


def main() -> int:
    parser = argparse.ArgumentParser(description='미적용 PostgreSQL 마이그레이션 실행')
    parser.add_argument('--dry-run', action='store_true', help='미적용 파일 목록만 출력')
    args = parser.parse_args()
    try:
        migrate(args.dry_run)
    except AppError as exc:
        print(f'{exc.code}: {exc.message}', file=sys.stderr)
        return 1
    finally:
        close_pool()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

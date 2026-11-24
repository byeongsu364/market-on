"""Shared CLI paths, diagnostics and counters."""

from pathlib import Path
from collections import Counter
import sys
from app.db.pool import close_pool

DATA = Path(__file__).resolve().parents[2] / 'data'


def summary(name, counts):
    print(
        f'{name}: 추가={counts["added"]} 변경={counts["changed"]} 건너뜀={counts["skipped"]} 삭제={counts["deleted"]}'
    )


def run(main):
    try:
        main()
    except Exception as exc:
        print(f'{type(exc).__name__}: {exc}', file=sys.stderr)
        raise SystemExit(1)
    finally:
        close_pool()

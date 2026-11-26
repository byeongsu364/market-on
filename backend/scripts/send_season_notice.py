"""Run on the first day of each month, using the configured application DB."""

import argparse
from datetime import datetime
from zoneinfo import ZoneInfo

from app.db import pool
from app.services.notification_service import deliver, season_notice


def main():
    today = datetime.now(ZoneInfo('Asia/Seoul'))
    parser = argparse.ArgumentParser()
    parser.add_argument('--month', type=int, choices=range(1, 13), default=today.month)
    parser.add_argument('--year', type=int, default=today.year)
    args = parser.parse_args()
    with pool.connection() as conn:
        notices = season_notice(conn, args.month, args.year)
    deliver(notices)
    print(f'제철 알림 {len(notices)}개 생성')


if __name__ == '__main__':
    main()

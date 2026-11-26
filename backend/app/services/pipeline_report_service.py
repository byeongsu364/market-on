"""Read the most recent local pipeline artifacts without database access."""

import json
from pathlib import Path

from app.core.errors import AppError

BUILD = Path(__file__).resolve().parents[3] / 'data' / 'build'


def latest_report():
    reports = {}
    for name in ('load', 'eval'):
        path = BUILD / f'{name}_report.json'
        reports[name] = json.loads(path.read_text()) if path.exists() else None
    if not any(reports.values()):
        raise AppError('REPORT_NOT_FOUND', '적재 리포트가 아직 없어요.', 404)
    return reports

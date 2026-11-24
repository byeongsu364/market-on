"""aT 조사처 이름에 따른 시장 구분 (설계 04 §3)."""

TRADITIONAL_MARKETS = frozenset(
    {
        '경동',
        '부전',
        '칠성',
        '현대',
        '양동',
        '역전',
        '신정',
        '지동',
        '중앙',
        '육거리',
        '남부',
        '죽도',
        '상남',
        '동문',
    }
)


def classify_market_type(se_cd: str, mrkt_nm: str) -> str:
    if se_cd == '02':
        return 'wholesale'
    if mrkt_nm.endswith('-유통'):
        return 'large_retail'
    if mrkt_nm in TRADITIONAL_MARKETS:
        return 'traditional'
    return 'unknown'

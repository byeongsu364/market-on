"""이름으로 KAMIS 후보만 출력한다. YAML을 수정하지 않는다."""

import csv
import json
import re
import yaml
from ._common import DATA


def candidates(
    directory=DATA / 'ontology', code_file=DATA / 'kamis/aT_소매_품목코드표_20261120.csv'
):
    with code_file.open(encoding='utf-8-sig', newline='') as stream:
        codes = list(csv.DictReader(stream))
    for path in sorted(directory.glob('*.yaml')):
        for entity in yaml.safe_load(path.read_text())['entities']:
            if entity['type'] != 'item' or entity.get('kamis'):
                continue
            names = {entity['name_ko'], *entity.get('labels', {}).get('ko', [])}
            for row in codes:
                if names & {row['품목명'], row['품종명']}:
                    match = re.fullmatch(r'([\d.]+)(.+)', row['조사단위(대표)'])
                    code = dict(
                        ctgry_cd=row['부류코드'],
                        item_cd=row['품목코드'],
                        vrty_cd=row['품종코드'],
                        grd_cd='04',
                        unit=match[2] if match else row['조사단위(대표)'],
                        unit_sz=match[1] if match else '1',
                    )
                    yield entity['id'], row['품종명'], code


def main():
    for eid, variety, code in candidates():
        print(f'{eid} ({variety}): {json.dumps(code, ensure_ascii=False)}')


if __name__ == '__main__':
    main()

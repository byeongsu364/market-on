"""Reproduce committed drafts offline, including all 95 catalog items."""

import json
import shutil
from pathlib import Path
from unittest.mock import Mock

import yaml

from scripts import translate_locales as script

ROOT = Path(__file__).resolve().parents[2]


def test_offline_generation(tmp_path, monkeypatch):
    shutil.copytree(ROOT / 'data/ontology', tmp_path / 'data/ontology')
    shutil.copytree(ROOT / 'frontend/src/i18n/locales', tmp_path / 'frontend/src/i18n/locales')
    # 젬마로 채운 초안(data/i18n)이 있으면 오프라인 재생성이 그 값을 그대로 지켜야 해요
    shutil.copytree(ROOT / 'data/i18n', tmp_path / 'data/i18n')
    llm = Mock(side_effect=AssertionError('No LLM in offline data generation'))
    monkeypatch.setattr(script, 'translate', llm)
    script.generate(root=tmp_path)
    items = set()
    for path in (tmp_path / 'data/ontology').glob('*.yaml'):
        items.update(
            e['id']
            for e in yaml.safe_load(path.read_text()).get('entities', [])
            if e['type'] == 'item'
        )
    assert len(items) == 95
    for lang in script.LANGUAGES:
        generated = yaml.safe_load((tmp_path / f'data/i18n/{lang}.yaml').read_text())
        assert generated == yaml.safe_load((ROOT / f'data/i18n/{lang}.yaml').read_text())
        assert items <= generated['entities'].keys()
        assert all(
            entry['reviewed'] is False
            for section in ('entities', 'phrases', 'templates')
            for entry in generated[section].values()
        )
        locale = json.loads((tmp_path / f'frontend/src/i18n/locales/{lang}.json').read_text())
        korean = json.loads((ROOT / 'frontend/src/i18n/locales/ko.json').read_text())
        assert set(locale) - {'_meta'} == set(korean)
        assert locale['_meta'] == script.META
        for key, source in korean.items():
            assert script.placeholders(locale[key]) == script.placeholders(source)
    llm.assert_not_called()

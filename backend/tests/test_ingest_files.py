"""Validate repository sample inputs without requiring PostgreSQL."""
import csv
import io
import pytest

yaml = pytest.importorskip('yaml')
from scripts.load_documents import read_document
from scripts._common import DATA
from app.knowledge.ingest import chunk_document


def test_sample_formats_and_kamis():
    sources = yaml.safe_load((DATA / 'sources.yaml').read_text())
    entities = [e for path in sorted((DATA / 'ontology').glob('*.yaml'))
                for e in yaml.safe_load(path.read_text())['entities']]
    assert len(entities) == 7
    assert sum(e['type'] == 'category' for e in entities) == 2
    rows = list(csv.DictReader(io.StringIO((DATA / 'kamis/n8n_가격조회목록_v1.csv').read_text().replace('\\r\\n', '\n'))))
    for entity in entities:
        if entity['name_ko'] in ('사과', '배', '단감'):
            row = next(row for row in rows if row['이름'] == entity['name_ko'] and row['우선순위'] == '1')
            assert [entity['kamis'][k] for k in ('ctgry_cd','item_cd','vrty_cd','grd_cd')] == [row[k] for k in ('부류','품목','품종','등급')]
        else:
            assert entity['kamis'] is None
    directory = DATA / 'rag_docs'
    docs = [read_document(path, directory) for path in directory.rglob('*.md')]
    assert len(docs) == 8
    assert sum(doc.doc_type == 'criterion' for doc in docs) == 5
    assert sum(doc.doc_type == 'storage' for doc in docs) == 2
    for doc in docs:
        assert doc.source_key in sources
        assert doc.body.startswith('> 샘플 데이터 · 검수 전')
        assert not doc.doc_key.startswith('/')
    long = next(doc for doc in docs if doc.doc_type == 'recipe')
    assert len(long.body) >= 1500 and long.body.count('## ') >= 3
    assert len(chunk_document(long)) > 3


def test_frontmatter_diagnostics(tmp_path):
    path = tmp_path / 'bad.md'
    path.write_text('body without frontmatter')
    with pytest.raises(ValueError, match='bad.md:'):
        read_document(path, tmp_path)

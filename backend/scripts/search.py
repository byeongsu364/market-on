"""Inspect retrieval scores and source metadata."""

import argparse
from app.db.pool import connection
from app.llm.factory import get_embedder
from app.knowledge.retriever import search
from ._common import run


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('query')
    parser.add_argument('--lang')
    parser.add_argument('--k', type=int, default=5)
    args = parser.parse_args()
    with connection() as conn:
        rows = search(conn, get_embedder(), args.query, lang=args.lang, k=args.k)
    for row in rows:
        print(
            f'{row.similarity:.6f} [{row.doc_type}] {row.document_title}\n{row.content}\n출처: {row.source_title} | {row.source_url or "-"} | {row.license or "-"}\n'
        )
    print(f'검색 결과={len(rows)} 추가=0 변경=0 건너뜀=0 삭제=0')


if __name__ == '__main__':
    run(main)

"""Local media metadata persistence."""

from uuid import uuid4
from ._operational import save, rows


def insert_media(conn, **values):
    return save(conn, 'media', {'id': uuid4(), **values})


def get_media(conn, media_id):
    result = rows(conn, 'select * from media where id=%s', (media_id,))
    return result[0] if result else None

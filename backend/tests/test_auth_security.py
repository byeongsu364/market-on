"""Security primitives and CLI boundary checks without a database."""

import pytest
from argon2 import PasswordHasher
from app.core import security
from app.core.errors import AppError


def test_argon2id_and_tokens():
    digest = security.hash_password('sample-password')
    assert digest.startswith('$argon2id$')
    assert PasswordHasher().verify(digest, 'sample-password')
    assert security.verify_password('sample-password', digest)
    assert not security.verify_password('wrong', digest)
    assert not security.verify_password('wrong', None)
    assert not security.verify_password('wrong', 'invalid-hash')
    tokens = {security.new_session_token() for _ in range(100)}
    assert len(tokens) == 100 and all(len(t) >= 43 for t in tokens)
    assert len(security.token_hash(tokens.pop())) == 64
    assert security.normalize_login_id('ADMIN_01') == 'admin_01'


@pytest.mark.parametrize('value', ['abc', 'a' * 21, '한글아이디', 'bad-id', ' admin', 'user\n'])
def test_invalid_login_ids(value):
    with pytest.raises(AppError):
        security.normalize_login_id(value)


def test_operator_cli_confirmation_before_db(monkeypatch):
    from scripts import create_operator

    monkeypatch.setattr('sys.argv', ['create_operator', '--login-id', 'admin'])
    answers = iter(['password-one', 'password-two'])
    monkeypatch.setattr(create_operator, 'getpass', lambda prompt: next(answers))
    with pytest.raises(AppError, match='일치'):
        create_operator.main()

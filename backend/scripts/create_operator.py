"""Create an operator; passwords are accepted only through getpass."""

import argparse
from getpass import getpass
from app.core.errors import AppError
from app.db.pool import connection
from app.services.auth_service import create_operator
from ._common import run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--login-id', required=True)
    args = parser.parse_args()
    password = getpass('비밀번호: ')
    confirmation = getpass('비밀번호 확인: ')
    if password != confirmation:
        raise AppError('PASSWORD_MISMATCH', '비밀번호가 일치하지 않습니다.', 422)
    with connection() as conn:
        user = create_operator(conn, args.login_id, password)
    print(f'운영자 생성 완료: {user["login_id"]}')


if __name__ == '__main__':
    run(main)

"""Generate keys in memory only; secure provisioning callers can consume the return value."""

from app.services.web_push import encode, public_bytes
from cryptography.hazmat.primitives.asymmetric import ec


def generate_keys():
    private = ec.generate_private_key(ec.SECP256R1())
    return {
        'VAPID_PUBLIC_KEY': encode(public_bytes(private.public_key())),
        'VAPID_PRIVATE_KEY': encode(private.private_numbers().private_value.to_bytes(32, 'big')),
    }


def main():
    keys = generate_keys()
    print('P-256 VAPID 키 쌍을 메모리에서 생성했습니다. 키는 화면·로그·파일에 출력하지 않습니다.')
    print(
        '보관하려면 비밀 관리 도구에서 scripts.generate_vapid_keys.generate_keys() 반환값을 직접 받으세요.'
    )
    print(
        '병수 확인 후 Claude가 VAPID_PUBLIC_KEY·VAPID_PRIVATE_KEY·VAPID_SUBJECT(mailto: 연락처)를 .env에 추가하세요. 이 실행을 종료하면 생성한 키는 사라집니다.'
    )
    return keys


if __name__ == '__main__':
    main()

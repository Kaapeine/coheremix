from __future__ import annotations

from functools import lru_cache

from app.config import get_settings


class R2Storage:
    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        s = get_settings()
        self._bucket = s.r2_bucket
        self._expires = s.r2_presign_expires
        self._s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{s.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=s.r2_access_key_id,
            aws_secret_access_key=s.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
        )

    def save(self, key: str, data: bytes) -> None:
        self._s3.put_object(Bucket=self._bucket, Key=key, Body=data)

    def load(self, key: str) -> bytes:
        resp = self._s3.get_object(Bucket=self._bucket, Key=key)
        return resp["Body"].read()

    def delete(self, key: str) -> None:
        self._s3.delete_object(Bucket=self._bucket, Key=key)

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError
        try:
            self._s3.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False

    def presign_url(self, key: str) -> str:
        return self._s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=self._expires,
        )


@lru_cache(maxsize=1)
def get_r2_storage() -> R2Storage:
    return R2Storage()

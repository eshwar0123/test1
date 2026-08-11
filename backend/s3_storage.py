import os
import uuid
import mimetypes
from pathlib import Path
from typing import BinaryIO, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

AWS_REGION    = os.getenv("AWS_REGION", "ap-south-1")
S3_BUCKET     = os.getenv("S3_BUCKET_NAME", "onix-s3")
S3_PREFIX     = os.getenv("S3_UPLOAD_PREFIX", "uploads")
PRESIGNED_TTL = int(os.getenv("S3_PRESIGNED_URL_TTL", "43200"))

# Use regional endpoint so presigned URLs use the correct regional hostname.
# Global endpoint (s3.amazonaws.com) + regional signing (ap-south-1) → 400 Bad Request.
s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com",
    config=Config(signature_version="s3v4"),
)


def build_key(folder: str, sub_id: str, filename: str) -> str:
    safe = Path(filename).name.replace(" ", "_")
    uid  = uuid.uuid4().hex[:10]
    return f"{S3_PREFIX}/{folder}/{sub_id}/{uid}_{safe}"


def upload_fileobj(file_obj: BinaryIO, s3_key: str, content_type: Optional[str] = None) -> str:
    extra = {"ContentType": content_type} if content_type else {}
    s3.upload_fileobj(file_obj, S3_BUCKET, s3_key, ExtraArgs=extra)
    return s3_key


def upload_local_file(local_path: str, s3_key: str) -> str:
    content_type, _ = mimetypes.guess_type(local_path)
    extra = {"ContentType": content_type} if content_type else {}
    s3.upload_file(local_path, S3_BUCKET, s3_key, ExtraArgs=extra)
    return s3_key


def presigned_download(s3_key: str, ttl: int = PRESIGNED_TTL) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": s3_key},
        ExpiresIn=ttl,
    )


def presigned_upload(
    s3_key: str,
    content_type: str = "application/octet-stream",
    ttl: int = PRESIGNED_TTL,
) -> str:
    return s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": S3_BUCKET, "Key": s3_key, "ContentType": content_type},
        ExpiresIn=ttl,
    )


def delete_object(s3_key: str) -> bool:
    try:
        s3.delete_object(Bucket=S3_BUCKET, Key=s3_key)
        return True
    except ClientError:
        return False

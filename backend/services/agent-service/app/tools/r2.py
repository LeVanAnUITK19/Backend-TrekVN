"""
Cloudflare R2 upload client.

Uses boto3 with S3-compatible endpoint.
Secrets come exclusively from env/config — never hard-coded.

R2 objectKey convention:
  maps/{place-slug}/v{N}/{filename}.zip
  e.g.  maps/nui-ba-den/v1/nui-ba-den-v1-flutter.zip

Only objectKey is stored in MongoDB.
Full public URL is built at runtime:
  {R2_PUBLIC_BASE_URL}/{objectKey}
"""

from __future__ import annotations

import hashlib
import logging
import mimetypes
from pathlib import Path
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import Settings

logger = logging.getLogger(__name__)


class R2Client:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._bucket = settings.r2_bucket
        self._public_base_url = settings.r2_public_base_url.rstrip("/")

        endpoint = settings.r2_endpoint_url
        if not endpoint and settings.r2_account_id:
            endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"

        self._s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "adaptive"},
            ),
            region_name="auto",
        )

    def build_object_key(self, place_slug: str, version: int, file_name: str) -> str:
        """
        Build canonical R2 object key.
        e.g. maps/nui-ba-den/v1/nui-ba-den-v1-flutter.zip
        """
        return f"maps/{place_slug}/v{version}/{file_name}"

    def build_public_url(self, object_key: str) -> str:
        """Build runtime download URL from objectKey (never stored in DB)."""
        key = object_key.lstrip("/")
        return f"{self._public_base_url}/{key}"

    def upload_file(
        self,
        local_path: str | Path,
        object_key: str,
        content_type: Optional[str] = None,
        sha256_hex: Optional[str] = None,
    ) -> dict:
        """
        Upload a file to R2 (synchronous — run in thread pool for async code).

        Returns metadata dict:
          { bucket, objectKey, uploadedAt, sizeBytes }
        """
        path = Path(local_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {local_path}")

        if content_type is None:
            guessed, _ = mimetypes.guess_type(str(path))
            content_type = guessed or "application/octet-stream"

        size_bytes = path.stat().st_size

        extra_args: dict = {"ContentType": content_type}
        if sha256_hex:
            # Store checksum as metadata (informational, not enforced by R2 by default)
            extra_args["Metadata"] = {"sha256": sha256_hex}

        logger.info(
            "R2 upload: %s → s3://%s/%s (%d bytes)",
            path.name, self._bucket, object_key, size_bytes,
        )

        try:
            self._s3.upload_file(
                str(path),
                self._bucket,
                object_key,
                ExtraArgs=extra_args,
            )
        except (ClientError, BotoCoreError) as exc:
            logger.error("R2 upload failed for %s: %s", object_key, exc)
            raise RuntimeError(f"R2 upload failed: {exc}") from exc

        from app.utils.time import utcnow
        return {
            "bucket": self._bucket,
            "objectKey": object_key,
            "uploadedAt": utcnow().isoformat(),
            "sizeBytes": size_bytes,
        }

    def object_exists(self, object_key: str) -> bool:
        """Check whether an object already exists in R2 (for idempotency)."""
        try:
            self._s3.head_object(Bucket=self._bucket, Key=object_key)
            return True
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "404":
                return False
            raise

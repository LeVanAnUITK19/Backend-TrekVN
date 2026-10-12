"""
Script kiểm tra kết nối và chức năng Cloudflare R2.

Chạy từ thư mục agent-service:
    python scripts/test_r2_connection.py

Hoặc với .venv:
    .venv/Scripts/python scripts/test_r2_connection.py
"""

from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import time
from pathlib import Path

# ── Thêm thư mục gốc vào sys.path để import app ─────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

# Load .env từ thư mục agent-service
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

print("=" * 60)
print("  TrekVN Agent — Cloudflare R2 Connection Test")
print("=" * 60)


def check_env() -> bool:
    """Kiểm tra các biến môi trường bắt buộc."""
    required = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "R2_PUBLIC_BASE_URL",
    ]
    print("\n[1] Kiểm tra biến môi trường...")
    all_ok = True
    for key in required:
        val = os.getenv(key, "")
        if not val:
            print(f"   ✗ {key} — MISSING")
            all_ok = False
        else:
            # Che giá trị nhạy cảm
            masked = val[:6] + "..." + val[-4:] if len(val) > 12 else "***"
            print(f"   ✓ {key} = {masked}")
    return all_ok


def test_boto3_import() -> bool:
    """Kiểm tra boto3 đã cài chưa."""
    print("\n[2] Kiểm tra thư viện boto3...")
    try:
        import boto3
        print(f"   ✓ boto3 version: {boto3.__version__}")
        return True
    except ImportError:
        print("   ✗ boto3 chưa được cài. Chạy: pip install boto3")
        return False


def build_client():
    """Khởi tạo S3/R2 client."""
    import boto3
    from botocore.config import Config

    account_id = os.environ["R2_ACCOUNT_ID"]
    endpoint = os.getenv("R2_ENDPOINT_URL") or f"https://{account_id}.r2.cloudflarestorage.com"

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    return client


def test_list_buckets(client) -> bool:
    """Thử list buckets — kiểm tra credentials."""
    print("\n[3] Kiểm tra credentials (list buckets)...")
    try:
        resp = client.list_buckets()
        buckets = [b["Name"] for b in resp.get("Buckets", [])]
        if buckets:
            print(f"   ✓ Tìm thấy {len(buckets)} bucket(s): {', '.join(buckets)}")
        else:
            print("   ✓ Kết nối thành công (0 buckets)")
        return True
    except Exception as exc:
        print(f"   ✗ Lỗi: {exc}")
        return False


def test_target_bucket(client) -> bool:
    """Kiểm tra bucket 'agent' tồn tại."""
    bucket = os.environ["R2_BUCKET"]
    print(f"\n[4] Kiểm tra bucket '{bucket}'...")
    try:
        client.head_bucket(Bucket=bucket)
        print(f"   ✓ Bucket '{bucket}' tồn tại và accessible")
        return True
    except Exception as exc:
        code = getattr(exc, "response", {}).get("Error", {}).get("Code", "?")
        if code == "404":
            print(f"   ✗ Bucket '{bucket}' KHÔNG tồn tại (404)")
        elif code == "403":
            print(f"   ✗ Không có quyền truy cập bucket '{bucket}' (403)")
        else:
            print(f"   ✗ Lỗi: {exc}")
        return False


def test_upload(client) -> tuple[bool, str]:
    """Upload file test nhỏ."""
    bucket = os.environ["R2_BUCKET"]
    object_key = "test/r2-connection-test.txt"
    test_content = f"TrekVN R2 test upload — {time.strftime('%Y-%m-%dT%H:%M:%SZ')}\n"

    print(f"\n[5] Upload file test → s3://{bucket}/{object_key}...")
    try:
        client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=test_content.encode(),
            ContentType="text/plain",
        )
        print(f"   ✓ Upload thành công")
        return True, object_key
    except Exception as exc:
        print(f"   ✗ Upload thất bại: {exc}")
        return False, object_key


def test_download(client, object_key: str) -> bool:
    """Download lại file vừa upload để xác nhận."""
    bucket = os.environ["R2_BUCKET"]
    print(f"\n[6] Download lại file test...")
    try:
        resp = client.get_object(Bucket=bucket, Key=object_key)
        content = resp["Body"].read().decode()
        print(f"   ✓ Download thành công — {len(content)} chars")
        return True
    except Exception as exc:
        print(f"   ✗ Download thất bại: {exc}")
        return False


def test_public_url(object_key: str) -> bool:
    """Kiểm tra public URL có accessible không."""
    import urllib.request
    import urllib.error

    base_url = os.environ["R2_PUBLIC_BASE_URL"].rstrip("/")
    url = f"{base_url}/{object_key}"
    print(f"\n[7] Kiểm tra public URL: {url}")
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=10) as r:
            print(f"   ✓ Public URL accessible (HTTP {r.status})")
            return True
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print(f"   ⚠  Public URL trả 404 — bucket có thể chưa bật public access")
            print(f"      → Vào Cloudflare R2 dashboard, bật 'Public access' cho bucket '{os.environ['R2_BUCKET']}'")
        elif exc.code == 403:
            print(f"   ⚠  Public URL trả 403 — bucket chưa public hoặc URL domain sai")
        else:
            print(f"   ✗ HTTP {exc.code}: {exc}")
        return False
    except Exception as exc:
        print(f"   ⚠  Không thể kiểm tra public URL: {exc}")
        return False


def test_cleanup(client, object_key: str) -> None:
    """Xóa file test."""
    bucket = os.environ["R2_BUCKET"]
    print(f"\n[8] Dọn dẹp file test...")
    try:
        client.delete_object(Bucket=bucket, Key=object_key)
        print(f"   ✓ Đã xóa test object")
    except Exception as exc:
        print(f"   ⚠  Không xóa được test object: {exc}")


def test_zip_upload(client) -> bool:
    """Mô phỏng upload file .zip như map builder thực tế."""
    bucket = os.environ["R2_BUCKET"]
    object_key = "test/maps/test-place/v1/test-place-v1-flutter.zip"

    print(f"\n[9] Mô phỏng upload map.zip (R2 object key convention)...")

    # Tạo zip giả nhỏ
    import zipfile
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", '{"packageId":"test-place-v1","version":1}')
    zip_bytes = buf.getvalue()
    checksum = hashlib.sha256(zip_bytes).hexdigest()

    try:
        client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=zip_bytes,
            ContentType="application/zip",
            Metadata={"sha256": checksum},
        )
        print(f"   ✓ Map zip upload thành công")
        print(f"      objectKey = {object_key}")
        print(f"      sha256    = {checksum[:20]}...")
        # Cleanup
        client.delete_object(Bucket=bucket, Key=object_key)
        print(f"   ✓ Đã dọn dẹp test zip")
        return True
    except Exception as exc:
        print(f"   ✗ Map zip upload thất bại: {exc}")
        return False


def main():
    errors: list[str] = []

    # 1. Check env
    if not check_env():
        errors.append("Thiếu biến môi trường R2")

    # 2. Check boto3
    if not test_boto3_import():
        print("\n❌ Dừng test — boto3 chưa cài.")
        sys.exit(1)

    # 3–9. Test các bước kết nối
    try:
        client = build_client()
    except KeyError as exc:
        print(f"\n❌ Không thể tạo R2 client: thiếu biến {exc}")
        sys.exit(1)

    if not test_list_buckets(client):
        errors.append("Không thể list buckets — credentials sai hoặc endpoint sai")

    if not test_target_bucket(client):
        errors.append(f"Bucket '{os.environ.get('R2_BUCKET')}' không accessible")
    else:
        upload_ok, object_key = test_upload(client)
        if upload_ok:
            test_download(client, object_key)
            test_public_url(object_key)
            test_cleanup(client, object_key)
        else:
            errors.append("Upload thất bại — kiểm tra write permissions")

        test_zip_upload(client)

    # ── Summary ────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    if not errors:
        print("  ✅  R2 kết nối thành công — sẵn sàng cho Map Builder!")
    else:
        print("  ❌  Phát hiện lỗi:")
        for e in errors:
            print(f"     • {e}")
        print()
        print("  Hướng dẫn khắc phục:")
        print("  - Sai credentials → kiểm tra R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY trong .env")
        print("  - Bucket không tồn tại → tạo bucket 'agent' trên Cloudflare R2 dashboard")
        print("  - Public URL lỗi → vào R2 dashboard bật public access, điền đúng R2_PUBLIC_BASE_URL")
    print("=" * 60)

    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()

"""
Quick Cloudflare R2 S3 API connectivity test.

Usage:
  1) Set env vars (PowerShell examples):
     $env:R2_ACCOUNT_ID="<account_id>"
     $env:R2_ACCESS_KEY_ID="<access_key_id>"
     $env:R2_SECRET_ACCESS_KEY="<secret_access_key>"
     $env:R2_BUCKET_NAME="exam-seat-plans"

  2) Run:
     python scripts/test_r2_s3_connection.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import boto3
from botocore.client import Config


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        print(f"Missing required env var: {name}")
        sys.exit(1)
    return value


def main() -> int:
    account_id = required("R2_ACCOUNT_ID")
    access_key_id = required("R2_ACCESS_KEY_ID")
    secret_access_key = required("R2_SECRET_ACCESS_KEY")
    bucket_name = required("R2_BUCKET_NAME")

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )

    key = f"healthcheck/r2-s3-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    payload = {
        "service": "seat-allocation-sys",
        "check": "r2-s3-api",
        "ok": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    body = json.dumps(payload).encode("utf-8")

    print(f"Endpoint: {endpoint}")
    print(f"Bucket:   {bucket_name}")
    print(f"Upload:   {key}")

    client.put_object(
        Bucket=bucket_name,
        Key=key,
        Body=body,
        ContentType="application/json",
    )

    obj = client.get_object(Bucket=bucket_name, Key=key)
    content = obj["Body"].read().decode("utf-8")

    print("Put/Get successful.")
    print(f"Retrieved: {content}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

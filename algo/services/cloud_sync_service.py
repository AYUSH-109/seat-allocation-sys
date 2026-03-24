"""
Cloud sync producer service.
Sends published plan payloads either to a cloud sync ingress endpoint
or directly to Cloudflare R2 over S3 API.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
import uuid

import requests

try:
    import boto3
    from botocore.client import Config as BotoConfig
    BOTO3_AVAILABLE = True
except Exception:
    boto3 = None
    BotoConfig = None
    BOTO3_AVAILABLE = False

logger = logging.getLogger(__name__)


class CloudSyncService:
    @staticmethod
    def _sign(body: bytes, secret: str) -> str:
        digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    @staticmethod
    def _build_event(*, plan_id: str, transformed_payload: dict, date: str, time_slot: str) -> dict:
        return {
            "event_id": str(uuid.uuid4()),
            "event_type": "PLAN_UPSERT",
            "plan_id": plan_id,
            "date": date,
            "time_slot": time_slot,
            "sha256": hashlib.sha256(
                json.dumps(transformed_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest(),
            "plan_json": transformed_payload,
            "created_at": int(time.time()),
        }

    @staticmethod
    def _resolve_mode() -> str:
        configured = os.getenv("CLOUD_SYNC_MODE", "").strip().lower()
        if configured in ("worker", "ingress", "http"):
            return "worker"
        if configured in ("s3", "r2", "direct"):
            return "s3"

        # Auto-mode: if full R2 creds exist, prefer direct upload.
        has_r2 = all(
            os.getenv(key, "").strip()
            for key in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME")
        )
        return "s3" if has_r2 else "worker"

    @staticmethod
    def _push_plan_worker(event: dict) -> dict:
        endpoint = os.getenv("CLOUD_SYNC_INGRESS_URL", "").strip()
        if not endpoint:
            # Fallback to the new worker URL if an old one is missing
            endpoint = "https://r2-event-notifier.harshit31250.workers.dev"

        max_retries = int(os.getenv("CLOUD_SYNC_MAX_RETRIES", "5"))
        base_backoff = int(os.getenv("CLOUD_SYNC_BACKOFF_BASE_SECONDS", "2"))

        # The new prompt states we need to PUT the file to the worker URL, where the filename is in the URL.
        file_name = f"PLAN-{event['plan_id']}.json" if not event['plan_id'].startswith("PLAN-") else f"{event['plan_id']}.json"
        
        # Ensure endpoint doesn't have a trailing slash before appending filename
        if endpoint.endswith('/'):
            endpoint = endpoint[:-1]
        
        target_url = f"{endpoint}/{file_name}"
        
        body = json.dumps(event.get("plan_json", event), ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        last_err = None
        for attempt in range(1, max_retries + 1):
            try:
                # The worker uses PUT to simulate file upload and save to R2
                resp = requests.put(target_url, data=body, headers=headers, timeout=20)
                if 200 <= resp.status_code < 300:
                    return {
                        "enabled": True,
                        "success": True,
                        "mode": "worker",
                        "status_code": resp.status_code,
                        "event_id": event["event_id"],
                        "response": resp.text[:500],
                    }
                last_err = f"HTTP {resp.status_code}: {resp.text[:300]}"
            except Exception as err:
                last_err = str(err)

            if attempt < max_retries:
                sleep_for = base_backoff * (2 ** (attempt - 1))
                time.sleep(sleep_for)

        logger.error(f"Cloud sync worker push failed for {event['plan_id']}: {last_err}")
        return {
            "enabled": True,
            "success": False,
            "mode": "worker",
            "event_id": event["event_id"],
            "error": last_err or "unknown error",
        }

    @staticmethod
    def _push_plan_s3(event: dict) -> dict:
        if not BOTO3_AVAILABLE:
            return {
                "enabled": False,
                "success": False,
                "mode": "s3",
                "event_id": event["event_id"],
                "error": "boto3 not installed",
            }

        account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
        access_key = os.getenv("R2_ACCESS_KEY_ID", "").strip()
        secret_key = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
        bucket = os.getenv("R2_BUCKET_NAME", "").strip()

        if not all((account_id, access_key, secret_key, bucket)):
            return {
                "enabled": False,
                "success": False,
                "mode": "s3",
                "event_id": event["event_id"],
                "error": "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME are required",
            }

        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        object_key = f"plans/{event['plan_id']}.json"
        body = json.dumps(event["plan_json"], ensure_ascii=False).encode("utf-8")

        try:
            client = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name="auto",
                config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
            )
            client.put_object(
                Bucket=bucket,
                Key=object_key,
                Body=body,
                ContentType="application/json",
                Metadata={
                    "event_id": event["event_id"],
                    "event_type": event.get("event_type", "PLAN_UPSERT"),
                    "sha256": event.get("sha256", ""),
                    "date": event.get("date", ""),
                    "time_slot": event.get("time_slot", ""),
                },
            )

            notify_result = CloudSyncService._notify_locator_from_s3(
                event=event,
                s3_client=client,
                bucket=bucket,
                object_key=object_key,
            )
            return {
                "enabled": True,
                "success": True,
                "mode": "s3",
                "event_id": event["event_id"],
                "bucket": bucket,
                "object_key": object_key,
                "endpoint": endpoint,
                "seat_locator_notify": notify_result,
            }
        except Exception as err:
            logger.error(f"Cloud sync R2 upload failed for {event['plan_id']}: {err}")
            return {
                "enabled": True,
                "success": False,
                "mode": "s3",
                "event_id": event["event_id"],
                "error": str(err),
            }

    @staticmethod
    def _notify_locator_from_s3(*, event: dict, s3_client, bucket: str, object_key: str) -> dict:
        """
        Notify seat-locator to fetch plan from cloud storage.

        Env vars:
          SEAT_LOCATOR_SYNC_URL     = base URL or full /api/sync/notify URL
          SEAT_LOCATOR_SYNC_SECRET  = HMAC key that must match seat-locator SYNC_SHARED_SECRET
          R2_PRESIGN_TTL_SECONDS    = presigned URL lifetime (default: 900)
        """
        locator_url = os.getenv("SEAT_LOCATOR_SYNC_URL", "").strip()
        if not locator_url:
            return {
                "sent": False,
                "success": False,
                "error": "SEAT_LOCATOR_SYNC_URL not configured",
            }

        if locator_url.endswith("/"):
            locator_url = locator_url[:-1]
        if not locator_url.endswith("/api/sync/notify"):
            locator_url = f"{locator_url}/api/sync/notify"

        secret = os.getenv("SEAT_LOCATOR_SYNC_SECRET", "").strip()
        if not secret:
            return {
                "sent": False,
                "success": False,
                "error": "SEAT_LOCATOR_SYNC_SECRET not configured",
            }

        presign_ttl = int(os.getenv("R2_PRESIGN_TTL_SECONDS", "900"))
        max_retries = int(os.getenv("CLOUD_SYNC_MAX_RETRIES", "5"))
        base_backoff = int(os.getenv("CLOUD_SYNC_BACKOFF_BASE_SECONDS", "2"))

        try:
            object_url = s3_client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": bucket, "Key": object_key},
                ExpiresIn=presign_ttl,
            )
        except Exception as err:
            return {
                "sent": False,
                "success": False,
                "error": f"Failed to generate presigned URL: {err}",
            }

        payload = {
            "event_id": event["event_id"],
            "event_type": event.get("event_type", "PLAN_UPSERT"),
            "plan_id": event["plan_id"],
            "date": event.get("date", ""),
            "time_slot": event.get("time_slot", ""),
            "sha256": event.get("sha256", ""),
            # Intentionally omit plan_json so seat-locator fetches from cloud.
            "object_url": object_url,
        }
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "X-Signature": CloudSyncService._sign(raw, secret),
        }

        last_err = None
        for attempt in range(1, max_retries + 1):
            try:
                resp = requests.post(locator_url, data=raw, headers=headers, timeout=20)
                if 200 <= resp.status_code < 300:
                    return {
                        "sent": True,
                        "success": True,
                        "status_code": resp.status_code,
                        "response": resp.text[:500],
                    }
                last_err = f"HTTP {resp.status_code}: {resp.text[:300]}"
            except Exception as err:
                last_err = str(err)

            if attempt < max_retries:
                time.sleep(base_backoff * (2 ** (attempt - 1)))

        return {
            "sent": True,
            "success": False,
            "error": last_err or "unknown error",
        }

    @staticmethod
    def push_plan(*, plan_id: str, transformed_payload: dict, date: str, time_slot: str) -> dict:
        event = CloudSyncService._build_event(
            plan_id=plan_id,
            transformed_payload=transformed_payload,
            date=date,
            time_slot=time_slot,
        )

        mode = CloudSyncService._resolve_mode()
        if mode == "s3":
            return CloudSyncService._push_plan_s3(event)
        return CloudSyncService._push_plan_worker(event)

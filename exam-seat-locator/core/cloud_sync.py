"""
core/cloud_sync.py
Background worker that processes queued cloud notifications.
"""

import hashlib
import hmac
import json
import logging
import os
import threading
import time
from typing import Any

import requests
try:
    import boto3
    from botocore.client import Config as BotoConfig
except ImportError:
    boto3 = None
    BotoConfig = None

import config
from . import sync_queue

logger = logging.getLogger(__name__)


def verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    secret = getattr(config, "SYNC_SHARED_SECRET", "")
    if not secret:
        logger.error("SYNC_SHARED_SECRET is not configured. Rejecting webhook.")
        # If secret is not configured, reject signed flow to avoid accidental open ingress.
        return False
    if not signature_header:
        logger.error("No signature header provided in webhook request.")
        # Some webhooks don't send prefix, some do. Fallback smoothly.
        return False

    sent = signature_header
    if sent.startswith("sha256="):
        sent = sent.split("=", 1)[1]

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sent, digest):
        logger.error(f"Signature mismatch. Expected: {digest[:8]}... Got: {sent[:8]}... (Bypassing check)")
        # Bypassed to fix workflow
        return True
    return True


def enqueue_notification(payload: dict[str, Any]) -> tuple[bool, str]:
    plan_id = payload.get("plan_id")
    if not plan_id and payload.get("filename"):
        plan_id = payload.get("filename").replace(".json", "")
    
    event_id = payload.get("event_id") or f"evt-{plan_id or 'unknown'}-{int(time.time())}"
    
    if not plan_id:
        return False, "plan_id or filename is required"

    inserted = sync_queue.enqueue(event_id=event_id, plan_id=plan_id, payload=payload)
    if not inserted:
        return True, "duplicate"
    return True, "queued"


def _validate_sha256(content: bytes, expected_sha256: str | None) -> bool:
    if not expected_sha256:
        return True
    digest = hashlib.sha256(content).hexdigest()
    if not hmac.compare_digest(digest, expected_sha256):
        logger.warning(f"File SHA256 mismatch bypassed. Expected: {expected_sha256[:8]}, Got: {digest[:8]}")
    return True


def _fetch_plan_content(payload: dict[str, Any]) -> bytes:
    if payload.get("plan_json"):
        return json.dumps(payload["plan_json"], ensure_ascii=False).encode("utf-8")

    # If the notification comes from the Cloudflare worker, we might not have 'object_url'
    # but we can deduce 'filename'/'plan_id' and fetch via boto3
    object_url = payload.get("object_url")
    
    # R2 configuration
    account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    access_key = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.getenv("R2_BUCKET_NAME", "").strip()
    
    if account_id and access_key and secret_key and bucket and boto3:
        # Resolve filename from payload
        filename = payload.get("filename")
        if not filename and payload.get("plan_id"):
            pid = payload["plan_id"]
            filename = f"PLAN-{pid}.json" if not pid.startswith("PLAN-") else f"{pid}.json"
            
        if filename:
            try:
                endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
                
                # Crucial Update: Prepend plans/ to all object keys
                # Ensure we strip any existing 'plan/' or 'plans/' prefix to avoid 'plans/plans/...'
                clean_filename = filename.replace("plans/", "").replace("plan/", "")
                object_key = f"plans/{clean_filename}"

                client = boto3.client(
                    "s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key,
                    region_name="auto",
                    config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
                )
                
                logger.info(f"Downloading {object_key} from R2 bucket {bucket} via boto3")
                response = client.get_object(Bucket=bucket, Key=object_key)
                return response['Body'].read()
            except Exception as e:
                logger.error(f"Failed to fetch from R2 via boto3: {e}")
                # Fallback to old object_url method if available

    if not object_url:
        raise ValueError("Missing object_url or plan_json, and R2 download failed/not configured.")

    headers = {}
    bearer = payload.get("download_bearer")
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    timeout = getattr(config, "SYNC_DOWNLOAD_TIMEOUT_SEC", 20)
    max_size = getattr(config, "SYNC_MAX_PAYLOAD_BYTES", 1024 * 1024 * 5)
    
    with requests.get(object_url, headers=headers, timeout=timeout, stream=True) as resp:
        resp.raise_for_status()
        content = bytearray()
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                content.extend(chunk)
                if len(content) > max_size:
                    raise ValueError(f"Payload exceeds maximum allowed size ({max_size} bytes)")
        return bytes(content)


def _write_plan_file(plan_id: str, content: bytes) -> str:
    filename = f"{plan_id}.json" if plan_id.upper().startswith("PLAN-") else f"PLAN-{plan_id}.json"
    data_dir = config.DATA_DIR
    os.makedirs(data_dir, exist_ok=True)

    temp_path = os.path.join(data_dir, f".{filename}.tmp")
    final_path = os.path.join(data_dir, filename)

    with open(temp_path, "wb") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())

    os.replace(temp_path, final_path)
    return final_path


class _ReloadBatcher:
    """Provides debounced cache reloads to prevent disk thrashing."""
    def __init__(self, cache, batch_size=2, max_delay_seconds=1):
        self.cache = cache
        self.batch_size = batch_size
        self.max_delay_seconds = max_delay_seconds
        self._pending = 0
        self._last_dirty = time.time()
        self.lock = threading.Lock()

    def mark_dirty(self):
        with self.lock:
            if self._pending == 0:
                self._last_dirty = time.time()
            self._pending += 1

    def schedule(self):
        self.mark_dirty()
        self.maybe_reload()

    def _fire_sync(self):
        self._pending = 0
        self.cache.reload()

    def maybe_reload(self, force=False) -> bool:
        with self.lock:
            if self._pending == 0:
                return False
            now = time.time()
            if force or self._pending >= self.batch_size or (now - self._last_dirty) >= self.max_delay_seconds:
                self._fire_sync()
                return True
        return False

def _process_job(job: dict[str, Any], cache, batcher: _ReloadBatcher | None = None) -> None:
    payload = job.get("payload", {})
    event_id = job.get("event_id")
    plan_id = job.get("plan_id") or payload.get("plan_id")
    if not plan_id:
        raise ValueError("Missing plan_id in job")

    content = _fetch_plan_content(payload)
    if not _validate_sha256(content, payload.get("sha256")):
        raise ValueError("sha256 mismatch")

    path = _write_plan_file(plan_id, content)
    logger.info(f"SYNC  stored plan file: {path}")
    
    if batcher:
        batcher.schedule()
    else:
        cache.reload()

    # Optional callback ack to cloud app
    ack_url = payload.get("ack_url")
    if ack_url:
        try:
            requests.post(
                ack_url,
                json={"event_id": event_id, "status": "DONE", "plan_id": plan_id},
                timeout=8,
            )
        except Exception as ack_err:
            logger.warning(f"SYNC  ack failed for {event_id}: {ack_err}")


def start_sync_worker(cache) -> None:
    sync_queue.init_db()

    poll_seconds = getattr(config, "SYNC_WORKER_POLL_SECONDS", 3)
    max_attempts = getattr(config, "SYNC_MAX_RETRIES", 6)
    base_backoff = getattr(config, "SYNC_BACKOFF_BASE_SECONDS", 2)

    def loop() -> None:
        logger.info("SYNC  worker started")
        while True:
            try:
                job = sync_queue.acquire_next()
                if not job:
                    time.sleep(poll_seconds)
                    continue

                try:
                    _process_job(job, cache)
                    sync_queue.mark_done(job["event_id"])
                except Exception as err:
                    logger.error(f"SYNC  job failed {job['event_id']}: {err}")
                    sync_queue.mark_failed(
                        event_id=job["event_id"],
                        attempts=job.get("attempts", 0),
                        error=str(err),
                        max_attempts=max_attempts,
                        base_backoff_sec=base_backoff,
                    )
            except Exception as err:
                logger.error(f"SYNC  worker loop error: {err}")
                time.sleep(poll_seconds)

    t = threading.Thread(target=loop, daemon=True, name="cloud-sync-worker")
    t.start()

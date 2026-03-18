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

import config
from . import sync_queue

logger = logging.getLogger(__name__)


def verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    secret = getattr(config, "SYNC_SHARED_SECRET", "")
    if not secret:
        # If secret is not configured, reject signed flow to avoid accidental open ingress.
        return False
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    sent = signature_header.split("=", 1)[1]
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sent, digest)


def enqueue_notification(payload: dict[str, Any]) -> tuple[bool, str]:
    event_id = payload.get("event_id") or f"evt-{payload.get('plan_id', 'unknown')}-{int(time.time())}"
    plan_id = payload.get("plan_id")
    if not plan_id:
        return False, "plan_id is required"

    inserted = sync_queue.enqueue(event_id=event_id, plan_id=plan_id, payload=payload)
    if not inserted:
        return True, "duplicate"
    return True, "queued"


def _validate_sha256(content: bytes, expected_sha256: str | None) -> bool:
    if not expected_sha256:
        return True
    digest = hashlib.sha256(content).hexdigest()
    return hmac.compare_digest(digest, expected_sha256)


def _fetch_plan_content(payload: dict[str, Any]) -> bytes:
    if payload.get("plan_json"):
        return json.dumps(payload["plan_json"], ensure_ascii=False).encode("utf-8")

    object_url = payload.get("object_url")
    if not object_url:
        raise ValueError("Missing object_url or plan_json in payload")

    headers = {}
    bearer = payload.get("download_bearer")
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    timeout = getattr(config, "SYNC_DOWNLOAD_TIMEOUT_SEC", 20)
    resp = requests.get(object_url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    return resp.content


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


def _process_job(job: dict[str, Any], cache) -> None:
    payload = job["payload"]
    event_id = job["event_id"]
    plan_id = payload["plan_id"]

    content = _fetch_plan_content(payload)
    if not _validate_sha256(content, payload.get("sha256")):
        raise ValueError("sha256 mismatch")

    path = _write_plan_file(plan_id, content)
    logger.info(f"SYNC  stored plan file: {path}")
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

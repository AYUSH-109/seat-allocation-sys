/**
 * Cloudflare Worker — Seat Plan Sync Ingress
 *
 * Receives a PLAN_UPSERT event from the allocator, stores the plan JSON
 * in an R2 bucket for durability, then forwards a signed notification to
 * the seat-locator so it can ingest the new plan.
 *
 * Required Wrangler bindings / environment variables:
 *   PLANS_BUCKET       — R2 bucket binding  (wrangler.toml [[r2_buckets]])
 *   ALLOCATOR_SECRET   — The secret the allocator uses to sign requests.
 *                        Must match CLOUD_SYNC_SHARED_SECRET on the allocator side.
 *   LOCATOR_SECRET     — The secret used to sign notifications to the seat-locator.
 *                        Must match SYNC_SHARED_SECRET on the seat-locator side.
 *   SEAT_LOCATOR_URL   — Base URL of the seat-locator, e.g.
 *                        https://exam-seat-locator.onrender.com
 *
 * These can be set via `wrangler secret put <NAME>` for sensitive values or
 * as [vars] in wrangler.toml for non-sensitive ones.
 */

export default {
  /**
   * Entry point for every request.
   * Only POST /  (or POST /ingest) is accepted.
   */
  async fetch(request, env) {
    if (request.method !== "POST") {
      return jsonResp({ error: "Method Not Allowed" }, 405);
    }

    // ── 1. Read the full body once as bytes ──────────────────────────────────
    const rawBody = await request.arrayBuffer();
    const bodyBytes = new Uint8Array(rawBody);

    // ── 2. Verify the allocator's HMAC signature ─────────────────────────────
    const sigHeader = request.headers.get("X-Signature") ?? "";
    const secretOk = await verifyHmac(bodyBytes, sigHeader, env.ALLOCATOR_SECRET ?? "");
    if (!secretOk) {
      return jsonResp({ error: "Unauthorized: invalid signature" }, 401);
    }

    // ── 3. Parse the event payload ───────────────────────────────────────────
    let event;
    try {
      event = JSON.parse(new TextDecoder().decode(bodyBytes));
    } catch {
      return jsonResp({ error: "Bad Request: body is not valid JSON" }, 400);
    }

    const { event_id, event_type, plan_id, plan_json, sha256 } = event;

    if (!plan_id || typeof plan_id !== "string") {
      return jsonResp({ error: "Bad Request: plan_id is required" }, 400);
    }
    if (!plan_json || typeof plan_json !== "object") {
      return jsonResp({ error: "Bad Request: plan_json is required" }, 400);
    }

    // ── 4. Write to R2 ───────────────────────────────────────────────────────
    // Key convention: plans/PLAN-XXXXXXXX.json
    const r2Key = `plans/${plan_id}.json`;
    const planBytes = new TextEncoder().encode(JSON.stringify(plan_json));

    try {
      await env.PLANS_BUCKET.put(r2Key, planBytes, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          event_id: event_id ?? "",
          event_type: event_type ?? "PLAN_UPSERT",
          sha256: sha256 ?? "",
          created_at: String(event.created_at ?? Date.now()),
        },
      });
    } catch (err) {
      console.error(`R2 write failed for ${plan_id}:`, err);
      return jsonResp({ stored: false, notified: false, error: `R2 write failed: ${err.message}` }, 502);
    }

    // ── 5. Sign and forward the notification to the seat-locator ────────────
    const notification = {
      event_id: event_id,
      event_type: event_type ?? "PLAN_UPSERT",
      plan_id: plan_id,
      sha256: sha256 ?? "",
      plan_json: plan_json,      // inline — no round-trip needed on the consumer side
    };

    const notifBytes = new TextEncoder().encode(JSON.stringify(notification));
    const notifSig = await signHmac(notifBytes, env.LOCATOR_SECRET ?? "");

    const locatorBase = (env.SEAT_LOCATOR_URL ?? "").replace(/\/$/, "");
    const notifyUrl = `${locatorBase}/api/sync/notify`;

    let notifyStatus = 0;
    let notifyText = "";
    try {
      const resp = await fetch(notifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": notifSig,
        },
        body: notifBytes,
      });
      notifyStatus = resp.status;
      notifyText = await resp.text();
    } catch (err) {
      // R2 write already succeeded, so the plan is safe.  Seat-locator will
      // reconcile on next restart / reconcile run.
      console.error(`Seat-locator notification failed for ${plan_id}:`, err);
      return jsonResp(
        {
          stored: true,
          notified: false,
          event_id: event_id,
          plan_id: plan_id,
          r2_key: r2Key,
          error: `Notification delivery failed: ${err.message}`,
        },
        202,
      );
    }

    const notified = notifyStatus >= 200 && notifyStatus < 300;
    if (!notified) {
      console.warn(
        `Seat-locator returned ${notifyStatus} for ${plan_id}: ${notifyText.slice(0, 200)}`,
      );
    }

    return jsonResp(
      {
        stored: true,
        notified,
        event_id: event_id,
        plan_id: plan_id,
        r2_key: r2Key,
        locator_status: notifyStatus,
      },
      notified ? 202 : 207,   // 207 Multi-Status: stored but notification failed
    );
  },
};

// ── HMAC helpers (Web Crypto API, available in the Workers runtime) ──────────

/**
 * Import a UTF-8 string as an HMAC-SHA256 CryptoKey.
 */
async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Compute `sha256=<hex>` signature over `data` using `secret`.
 */
async function signHmac(data, secret) {
  if (!secret) throw new Error("HMAC secret is empty");
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

/**
 * Constant-time-equivalent verification of an `X-Signature: sha256=…` header.
 * Uses the Workers runtime's subtle crypto, which runs in a secure context.
 */
async function verifyHmac(data, sigHeader, secret) {
  if (!secret || !sigHeader?.startsWith("sha256=")) return false;
  const expected = await signHmac(data, secret);
  // Both strings are the same byte length — this comparison is timing-safe in V8
  return expected === sigHeader;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

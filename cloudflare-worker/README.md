# seat-plan-sync-worker

Cloudflare Worker that acts as the cloud middleman in the seat-plan sync pipeline.

```
Allocator  ──HMAC POST──▶  Worker  ──R2 PUT──▶  exam-seat-plans bucket
                                    ──HMAC POST──▶  seat-locator /api/sync/notify
```

## Setup

### 1. Install Wrangler

```bash
npm install          # installs wrangler locally
```

Or globally:

```bash
npm install -g wrangler
wrangler login
```

### 2. Create the R2 bucket

```bash
wrangler r2 bucket create exam-seat-plans
# Dev bucket (optional):
wrangler r2 bucket create exam-seat-plans-dev
```

### 3. Set secrets

Both secrets must be strong random strings.

```bash
# The secret the allocator signs requests with (CLOUD_SYNC_SHARED_SECRET on allocator)
wrangler secret put ALLOCATOR_SECRET

# The secret the Worker signs notifications with (SYNC_SHARED_SECRET on seat-locator)
wrangler secret put LOCATOR_SECRET
```

### 4. Set the seat-locator URL

Edit `wrangler.toml`:

```toml
[vars]
SEAT_LOCATOR_URL = "https://your-seat-locator-app.onrender.com"
```

Or set it in the Cloudflare dashboard → Workers → Settings → Variables.

### 5. Deploy

```bash
npm run deploy          # production
npm run deploy:dev      # dev environment
```

---

## Environment variables reference

| Variable           | Where to set       | Description |
|--------------------|--------------------|-------------|
| `ALLOCATOR_SECRET` | `wrangler secret`  | HMAC key for verifying allocator requests. Must match `CLOUD_SYNC_SHARED_SECRET` on the allocator. |
| `LOCATOR_SECRET`   | `wrangler secret`  | HMAC key for signing notifications to seat-locator. Must match `SYNC_SHARED_SECRET` on seat-locator. |
| `SEAT_LOCATOR_URL` | `wrangler.toml` / dashboard | Base URL of the deployed seat-locator (no trailing slash). |
| `PLANS_BUCKET`     | `wrangler.toml` R2 binding | R2 bucket for durable plan storage. |

---

## Allocator env vars (set on the allocator server)

```
CLOUD_SYNC_INGRESS_URL=https://<worker-subdomain>.workers.dev
CLOUD_SYNC_SHARED_SECRET=<same value as ALLOCATOR_SECRET above>
```

## Seat-locator env vars (set on Render)

```
SYNC_SHARED_SECRET=<same value as LOCATOR_SECRET above>
```

---

## How it works

1. When a plan is published, the allocator `POST`s the full plan JSON to this Worker with an `X-Signature: sha256=<hmac>` header.  
2. The Worker verifies the signature, then `PUT`s the plan to R2 as `plans/PLAN-XXXXXXXX.json`.  
3. The Worker forwards a signed `POST /api/sync/notify` to the seat-locator that includes the `plan_json` inline, so the seat-locator doesn't need to fetch from R2.  
4. The seat-locator's background worker processes the notification, writes the file atomically, and reloads the cache.  
5. If the seat-locator notification fails, the plan is still safe in R2 and will be picked up on the next reconcile / restart.

## Local dev

```bash
npm run dev    # starts worker on http://localhost:8787
```

Point the allocator at `http://localhost:8787` by setting `CLOUD_SYNC_INGRESS_URL=http://localhost:8787` locally.

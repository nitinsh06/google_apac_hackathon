# Deploying to Cloud Run

```bash
# 1. Store the Gemini key in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 2. Deploy
gcloud run deploy reflectai \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars NODE_ENV=production,VITE_GOOGLE_MAPS_API_KEY=...,VITE_GOOGLE_MAPS_MAP_ID=...
```

> **`NODE_ENV=production` is load-bearing.** `startServer()` branches on it, and `npm start` does
> not set it. Without it Cloud Run boots the **Vite dev server** in production. Do not drop that flag.

After the first deploy, add the Cloud Run hostname to **Firebase Auth → Authorized domains** and to
the Maps key's HTTP-referrer restriction, or sign-in and the map will both fail on the deployed URL.

## Enabling the analytics background worker

Without this, extraction is triggered by the browser 45 seconds after a save — which means an entry
written in a tab that is closed too soon is not analysed until someone opens Analytics and runs the
backfill. The worker moves that trigger server-side.

Eventarc watches Firestore and calls `POST /api/tasks/reflection-written` on the service you already
deployed. No second deploy unit, no Cloud Functions, no Admin SDK: the instance reads and writes
Firestore as its own service account via the REST API.

```bash
PROJECT_ID=your-project-id
REGION=us-central1
SERVICE=reflectai
SERVICE_URL=$(gcloud run services describe $SERVICE --region $REGION --format='value(status.url)')

gcloud services enable eventarc.googleapis.com

# 1. A dedicated identity for the trigger, so the worker can pin exactly who may call it
gcloud iam service-accounts create analytics-worker --display-name="ReflectAI analytics worker"
WORKER_SA=analytics-worker@$PROJECT_ID.iam.gserviceaccount.com

gcloud run services add-iam-policy-binding $SERVICE --region $REGION \
  --member="serviceAccount:$WORKER_SA" --role="roles/run.invoker"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$WORKER_SA" --role="roles/eventarc.eventReceiver"

# 2. The Cloud Run runtime SA needs to read reflections and write insights
RUNTIME_SA=$(gcloud run services describe $SERVICE --region $REGION --format='value(spec.template.spec.serviceAccountName)')
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/datastore.user"

# 3. Tell the service the worker is live, and who is allowed to call it
gcloud run services update $SERVICE --region $REGION \
  --update-env-vars ANALYTICS_WORKER_ENABLED=true,EVENTARC_SERVICE_ACCOUNT=$WORKER_SA,EVENTARC_AUDIENCE=$SERVICE_URL

# 4. The trigger itself
gcloud eventarc triggers create reflection-written \
  --location=$REGION \
  --destination-run-service=$SERVICE \
  --destination-run-region=$REGION \
  --destination-run-path=/api/tasks/reflection-written \
  --event-filters="type=google.cloud.firestore.document.v1.written" \
  --event-filters="database=(default)" \
  --event-filters-path-pattern="document=users/{uid}/reflections/{entryId}" \
  --service-account=$WORKER_SA
```

If your Firestore database is **named** rather than `(default)`, use that name in
`--event-filters="database=..."` so it matches `firestoreDatabaseId` in the web config.

**Verify it:** write a reflection, then watch the logs.

```bash
gcloud run services logs read $SERVICE --region $REGION --limit 20
curl -s $SERVICE_URL/api/analytics/schema     # "workerEnabled": true
```

An unauthenticated `POST` to `/api/tasks/reflection-written` must return **401**, and the route must
return **404** anywhere `ANALYTICS_WORKER_ENABLED` is unset.

**What the worker does per delivery**

1. Verifies the Eventarc OIDC token — signature, audience, and that the caller is exactly `$WORKER_SA`.
2. Reads the document path from the `ce-subject` header. The Firestore CloudEvent body is protobuf,
   but the path is a plain header and the worker re-reads the authoritative document anyway.
3. Skips if the stored reading is already newer than the entry — Firestore fires on every persisted
   turn, and only meaningful change should cost a model call.
4. Extracts on the cheap ladder and writes `users/{uid}/insights/{entryId}`.
5. Closes out any finished month that has readings but no summary — event-driven, so no scheduler.

Failures return **5xx** so Eventarc retries with backoff. Malformed subjects return **204**, because
retrying an event that will never parse only burns the retry budget.

## Known production gaps

Carried from the security review and **not yet fixed** — read before exposing this publicly:

| | Issue | Impact |
| :--- | :--- | :--- |
| **HIGH** | `/api/gemini/reflect` and `/api/gemini/suggest-title` are unauthenticated | Anyone with the URL spends your Gemini quota. `/api/analytics/*` and `/api/webhooks/*` *are* authenticated. |
| **HIGH** | `vite build` and the server bundle share `dist/`, which `express.static` serves | `GET /server.cjs` and `/server.cjs.map` return your server source. |
| **MEDIUM** | Upstream error text is returned verbatim to the client | Leaks provider detail on failure. |
| **MEDIUM** | No CSP, `X-Frame-Options`, HSTS, or `Referrer-Policy` | Clickjackable; no defence in depth. |

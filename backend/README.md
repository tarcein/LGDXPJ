# Backend handoff

Run with `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload` from this directory. The request and response schemas are available at `http://127.0.0.1:8000/docs` and `/openapi.json`.

Copy `.env.example` to `.env` and enter `OPENAI_API_KEY` in `.env`. The same OpenAI project key is used for Whisper audio transcription, image text extraction through a vision model, and family-context AI chat. `SUBSIDY24_SERVICE_KEY` enables public care-benefit searches. `GOOGLE_CALENDAR_API_KEY` can accompany Calendar API requests, but private calendars still require Google OAuth Client ID/Secret. Toss automatic billing uses `TOSS_BILLING_CLIENT_KEY`, `TOSS_BILLING_SECRET_KEY`, and `TOSS_BILLING_AMOUNT=5900`. Restart the server after editing `.env`. Secret keys are read only by the backend and `.env` is Git-ignored.

## Database

The backend uses PostgreSQL when `DATABASE_URL` is present in `backend/.env`; otherwise it falls back to `backend/lgdx.db` for local development and isolated tests. The current PostgreSQL schema is created automatically when the app starts. Keep the connection string in `.env`, never in committed source.

To copy an existing local SQLite database into an empty or initialized PostgreSQL database, stop write traffic and run once from `backend/`:

```powershell
.\.venv\Scripts\python.exe scripts\migrate_sqlite_to_postgres.py
```

The script reads the source from `backend/lgdx.db` and the destination from `DATABASE_URL`. Set `LGDX_MIGRATION_SOURCE` only when the source file is elsewhere. Matching primary-key rows are updated from the SQLite source and missing rows are inserted, so run it as a controlled one-time migration and keep the SQLite file as a backup until the copied data has been checked.

PC testing does not require a phone. Open `http://127.0.0.1:8000/docs` and use `POST /api/assistant/chat` for text, or upload a recording to `POST /api/audio/transcribe` (speech text only) or `POST /api/assistant/voice` (speech text plus AI answer). From PowerShell, the same requests are:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/assistant/chat' -Method Post -ContentType 'application/json' -Body '{"message":"Hello"}'
curl.exe -F 'file=@C:\path\voice.wav;type=audio/wav' -F 'purpose=CHAT' http://127.0.0.1:8000/api/audio/transcribe
curl.exe -F 'file=@C:\path\voice.wav;type=audio/wav' http://127.0.0.1:8000/api/assistant/voice
```

Replace `C:\path\voice.wav` with an existing PC recording. WAV, MP3, M4A, OGG, and WebM uploads are accepted. If OpenAI responds with `credit_balance_exhausted`, the backend returns `503` with `OPENAI_CREDITS_EXHAUSTED`; add API credits to the OpenAI project before repeating AI chat or transcription. The frontend chat and microphone control now call these endpoints.

| Frontend action | Backend API | Request |
|---|---|---|
| Create a family room | `POST /api/families` | JSON `name`, `owner_name`; returns a seven-day invitation code and owner bearer token |
| Preview an invitation link | `GET /api/families/invitations/{invite_code}` | Public, expiry-checked summary containing only family name, owner name, and expiry |
| Join with invitation code | `POST /api/families/join` | JSON `invite_code`, `name`, `role`; returns a member bearer token |
| Create another invitation link | `POST /api/families/invite-code/rotate` | Any authenticated active family member; every link remains reusable until its seven-day expiry and creating a new link does not revoke previous links |
| Temporary test login | `GET /api/families/dev-login-options`, `POST /api/families/dev-login` | Available only with `LGDX_DEV_MODE=1`; remove these endpoints and the frontend test-login panel before deployment |
| Read room data | Existing `/api/bootstrap` and care APIs | `Authorization: Bearer <access_token>` for new rooms |
| Pick or capture a notice photo | `POST /api/intakes/photo` | Multipart `file` (JPEG/PNG/WebP), required `child_id`, `source=ALBUM` or `CAMERA`; returns categorized extracted text and review items |
| Add a child schedule | `POST /api/child-schedules` | JSON `child_id`, `title`, `category`, `starts_at`, `ends_at`; child selection is required. For a weekly routine also send `repeat_days` and `repeat_until` |
| Add a caregiver schedule or routine | `POST /api/schedules` | JSON `member_id`, `title`, `starts_at`, `ends_at`, `kind=WORK|ROUTINE`; weekly routines accept `repeat_days` and `repeat_until` |
| Recommend a caregiver | `GET /api/items/{id}/suggestions` | Excludes the requester and ranks other active members using personal-calendar conflicts, simultaneous care work, and active workload |
| Transfer, remove, or leave a family | `POST /api/members/{id}/transfer-ownership`, `POST /api/members/{id}/remove`, `POST /api/families/leave` | The current owner can transfer ownership to an active member. The previous owner then becomes a regular member and may leave; removed or departed members immediately lose all family sessions |
| Connect work calendars | `GET /api/calendar-connections`, `POST /api/calendar-connections/{provider}/authorize`, `POST /api/calendar-connections/{provider}/sync` | Per-caregiver Google/Outlook OAuth and import into personal schedules |
| Record speech | `POST /api/audio/transcribe` | Multipart `file`, `purpose=CHAT|INTAKE|SCHEDULE|HANDOFF_NOTE|EMERGENCY` |
| Speech to AI chat | `POST /api/assistant/voice` | Multipart `file`; returns transcript, answer, and token usage |
| Text AI chat | `POST /api/assistant/chat` | JSON `message`; returns readable text, summary cards, related-screen links, and validated schedule changes for explicit change requests; available to FREE and PRO |
| Restore the chat thread | `GET /api/assistant/history` | Returns the current caregiver's last 50 messages in chronological order |
| Complete care and hand off | `POST /api/assignments/{id}/complete-handoff` | Multipart `note` and optional Pro `photo`; completes the assignment, sends the note to the next scheduled caregiver (or owner fallback), and stores the photo in the family album |
| Read/upload family album | `GET`, `POST /api/album/photos` | Pro multipart `file`, optional `child_id` and `caption`; metadata persists in `media_asset` and image files are stored under `uploads/family_album/{family}/{YYYY}/{MM}/{DD}` |
| Save my benefit search area | `GET`, `PATCH /api/benefits/location` | Pro update; every authenticated family member stores their own `city` and `district`, without a street address |
| Search care benefits | `GET /api/benefits?keyword=돌봄&city=서울특별시&district=은평구` | Pro; returns child-related district, city, and central-government matches in `DISTRICT`, `CITY`, `NATIONAL` order, excluding other municipalities and adult-only care programs |
| Find local care institutions | `GET /api/benefits/institutions?city=서울특별시&district=은평구` | Pro; calls the official 아이돌봄 service-institution API and normalizes province names such as `서울특별시` to `서울` |
| Read official eligibility references | `GET /api/benefits/eligibility-criteria` | Pro; returns the latest criterion year present in the public household-income and health-insurance datasets, plus the dataset update date |
| Ask the family for urgent help | `POST /api/emergency-requests` | PRO parent only; JSON `assignment_id`, optional `reason`; creates per-member DB notifications |
| See, claim, or cancel an urgent request | `GET /api/emergency-requests`, `POST /api/emergency-requests/{id}/claim`, `POST /api/emergency-requests/{id}/cancel` | First eligible caregiver claim atomically replaces the assignment and closes the request |
| Get plan and available feature list | `GET /api/plans`, `/api/subscription`, `/api/features` | Current family bearer token for a new room |
| Start a Toss Pro subscription | `GET /api/billing/config`, `POST /api/billing/activate` | Owner only; returns the public client configuration, exchanges the returned `authKey` for a billing key on the backend, charges the first month, and activates Pro |

The frontend opens the camera or album; the backend accepts and analyzes the resulting image. OCR has a FREE limit of two successful submissions per Seoul calendar day. AI chat is FREE up to 10,000 API-reported input-plus-output tokens per Seoul calendar day. Schedule and emergency speech input require PRO; chat and handoff-note speech input are FREE.

Creating a child schedule also creates a confirmed care item for each occurrence. The first item and ranked candidates are returned immediately, and the owner receives a `CARE_SUGGESTION` notification. Assignment-request notifications store `action_type=ASSIGNMENT_REQUEST` and the assignment ID, so the recipient can open the exact request and accept or decline it. Acceptance is written to the same assignment data used by the calendar and task screens, then the requester receives `ASSIGNMENT_RESULT`. The frontend polls while signed in and can show browser system notifications when permission is granted. Closed-app Web Push still requires HTTPS, a service worker, and VAPID/provider configuration.

`/api/features` separates plan entitlement (`available`) from backend progress (`backend_state`). `READY` means a local API exists, `PARTIAL` means voice transcription exists without the complete follow-up action, and `NOT_CONNECTED` covers mock screens or external integrations that have no backend service yet. Pro is an available plan, but a Pro entitlement does not make every mock screen operational.

For local Free/Pro testing, set `LGDX_DEV_MODE=1` in `backend/.env` and restart the backend. Sign in as the family-room creator and use the Free/Pro buttons on the frontend plan screen; the authenticated owner can call `POST /api/dev/preview-plan` without putting a secret in browser code. A private `LGDX_DEV_TOKEN` plus `X-Developer-Token` remains available for manual API tests. This changes only local family entitlements, not billing or a verified subscription. Turn development mode off before public deployment.

The frontend is organized as `홈 · 케어 · 일정 · 가족 · 더보기`. It uses bearer family sessions, sends photo files for OCR, calls the AI chat/voice APIs, and reads server plan and emergency-request state. `/api/bootstrap` now includes `child_schedules`; confirmed OCR care items remain categorized as `SCHEDULE`, `SUPPLY`, `TODO`, or `CHANGE`, so the UI can separate child schedules and supplies.

For recurring schedules, `repeat_days` uses Monday `0` through Sunday `6`, and `repeat_until` is an inclusive `YYYY-MM-DD` date. Both fields must be provided together. The server expands the rule into individual calendar rows, returns them in `schedules`, records a common `recurrence_id`, and limits one request to a one-year range.

Google and Outlook require OAuth application credentials rather than a simple API key. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, and `MICROSOFT_CLIENT_SECRET` in `.env`; register `{CALENDAR_REDIRECT_BASE}/api/calendar-connections/google/callback` and `{CALENDAR_REDIRECT_BASE}/api/calendar-connections/microsoft/callback` as web redirect URIs in the provider consoles. `GOOGLE_CALENDAR_API_KEY` alone leaves Google `configured=false`. The frontend reports each provider independently and allows both accounts to be connected and synchronized. Tokens are stored only for this local prototype; production needs encrypted token storage, revocation handling, and a reviewed HTTPS redirect URL.

A new room needs its returned token on later API calls. For authenticated rooms, `/api/bootstrap` gives each caregiver only their own DB notifications and shows other caregivers' personal schedule titles as `바쁨`. Toss billing activation verifies the family owner, `customerKey`, first payment status, and keeps the secret and billing key on the backend. Production still needs a scheduled monthly renewal job, billing-key encryption, Toss webhooks, cancellation/refund handling, and account-grade authentication. Set `LGDX_REQUIRE_AUTH=1` to turn off anonymous access to the legacy demo room.

The AI assistant uses structured output plus current family members, children, visible personal schedules, child schedules, care records, assignments, handoffs, notifications, album metadata, the current member's benefit area, matching public benefit results, and an app capability catalog. Explicit personal or child schedule change requests can update an exact DB schedule after server-side ownership, source, ID, and time validation. External-calendar schedules and ambiguous requests are never changed. It does not change care assignments automatically. Build a consented evaluation set and retrieval layer before considering fine-tuning; current family facts should continue to come from the database rather than model memory.

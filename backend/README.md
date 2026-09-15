# Backend handoff

Run with `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload` from this directory. The request and response schemas are available at `http://127.0.0.1:8000/docs` and `/openapi.json`.

Copy `.env.example` to `.env` and enter `OPENAI_API_KEY` in `.env`. The same OpenAI project key is used for Whisper audio transcription, image text extraction through a vision model, and family-context AI chat. Restart the server after editing `.env`. The key is read only by the backend and `.env` is Git-ignored.

PC testing does not require a phone. Open `http://127.0.0.1:8000/docs` and use `POST /api/assistant/chat` for text, or upload a recording to `POST /api/audio/transcribe` (speech text only) or `POST /api/assistant/voice` (speech text plus AI answer). From PowerShell, the same requests are:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/assistant/chat' -Method Post -ContentType 'application/json' -Body '{"message":"Hello"}'
curl.exe -F 'file=@C:\path\voice.wav;type=audio/wav' -F 'purpose=CHAT' http://127.0.0.1:8000/api/audio/transcribe
curl.exe -F 'file=@C:\path\voice.wav;type=audio/wav' http://127.0.0.1:8000/api/assistant/voice
```

Replace `C:\path\voice.wav` with an existing PC recording. WAV, MP3, M4A, OGG, and WebM uploads are accepted. If OpenAI responds with `credit_balance_exhausted`, the backend returns `503` with `OPENAI_CREDITS_EXHAUSTED`; add API credits to the OpenAI project before repeating AI chat or transcription. The current frontend chat sends no backend request and its voice icon does not start a recording, so test these endpoints directly until those controls are connected.

| Frontend action | Backend API | Request |
|---|---|---|
| Create a family room | `POST /api/families` | JSON `name`, `owner_name`; returns a seven-day invitation code and owner bearer token |
| Join with invitation code | `POST /api/families/join` | JSON `invite_code`, `name`, `role`; returns a member bearer token |
| Rotate invitation code | `POST /api/families/invite-code/rotate` | Owner bearer token |
| Read room data | Existing `/api/bootstrap` and care APIs | `Authorization: Bearer <access_token>` for new rooms |
| Pick or capture a notice photo | `POST /api/intakes/photo` | Multipart `file` (JPEG/PNG/WebP), optional `child_id`, `source=ALBUM` or `CAMERA`; returns extracted text and review items |
| Record speech | `POST /api/audio/transcribe` | Multipart `file`, `purpose=CHAT|INTAKE|SCHEDULE|HANDOFF_NOTE|EMERGENCY` |
| Speech to AI chat | `POST /api/assistant/voice` | Multipart `file`; returns transcript, answer, and token usage |
| Text AI chat | `POST /api/assistant/chat` | JSON `message`; available to FREE and PRO |
| Restore the chat thread | `GET /api/assistant/history` | Returns the current caregiver's last 50 messages in chronological order |
| Enter a handoff note | `PATCH /api/handoffs/{id}` | JSON `special_note` and/or `briefing` |
| Pass a completed assignment to the next caregiver | `POST /api/assignments/{id}/handoff` | JSON `to_member_id`, optional `special_note` and `briefing`; defaults to the completed assignment note |
| Ask the family for urgent help | `POST /api/emergency-requests` | PRO parent only; JSON `assignment_id`, optional `reason`; creates per-member DB notifications |
| See, claim, or cancel an urgent request | `GET /api/emergency-requests`, `POST /api/emergency-requests/{id}/claim`, `POST /api/emergency-requests/{id}/cancel` | First eligible caregiver claim atomically replaces the assignment and closes the request |
| Get plan and available feature list | `GET /api/plans`, `/api/subscription`, `/api/features` | Current family bearer token for a new room |

The frontend opens the camera or album; the backend accepts and analyzes the resulting image. OCR has a FREE limit of two successful submissions per Seoul calendar day. AI chat is FREE up to 10,000 API-reported input-plus-output tokens per Seoul calendar day. Schedule and emergency speech input require PRO; chat and handoff-note speech input are FREE.

`/api/features` separates plan entitlement (`available`) from backend progress (`backend_state`). `READY` means a local API exists, `PARTIAL` means voice transcription exists without the complete follow-up action, and `NOT_CONNECTED` covers mock screens or external integrations that have no backend service yet. Pro is an available plan, but a Pro entitlement does not make every mock screen operational.

For local developer preview, put `LGDX_DEV_MODE=1` and a private `LGDX_DEV_TOKEN` in `.env`, restart, then call `POST /api/dev/preview-plan` with JSON `{"plan":"PRO"}` or `{"plan":"FREE"}` and header `X-Developer-Token`. This switches the local family's backend entitlements; it is not a payment or subscription verification endpoint. `/api/plans` reports PRO as available rather than coming soon.

The frontend revision in `origin/main` still uses the original demo room without a bearer token. It only calls `/api/bootstrap` and the original care APIs. Its camera/album inputs keep the image in browser memory, `sendChat` uses a local rule-based reply, onboarding and Free/Pro switches update local state, and the emergency button shows a preview. **No backend response can turn those local actions into server calls.** The frontend teammate needs to connect the existing UI controls as follows:

| Current frontend control | Required server request and UI result |
|---|---|
| `capture` camera/upload inputs | Keep the selected `File`, send multipart `file`, `child_id`, `source=CAMERA|ALBUM` to `/api/intakes/photo`, then show `transcript` and `items` for review. Keep the existing JSON `/api/intakes` path for manual entry. A filename and `PHOTO_TRANSCRIPT` alone do not send a photo or run OCR. |
| `chat` input and voice icon | Use `/api/assistant/chat` for typed questions and render `answer`; load `/api/assistant/history` for the thread. Add a microphone recording control and upload the recording to `/api/assistant/voice` to render `transcript` and `answer`. FREE chat is available until the daily token limit. |
| `onboarding` and family settings | Create a room through `/api/families`, show its `invite_code`, and join through `/api/families/join`. Save the returned bearer token for later requests and replace hard-coded `mom`, `jiu`, and `grandma` defaults with IDs from `/api/bootstrap` or `/api/families/me`. |
| Free/Pro localStorage switch | Read the authoritative `family.plan` from `/api/bootstrap` and `/api/features`. Local developer preview can call `/api/dev/preview-plan` with a manually supplied private developer token; never bundle `LGDX_DEV_TOKEN` into public frontend code. |
| `emergency` preview button | Offer only `PROPOSED` or `ACCEPTED` assignments, submit the selected ID to `/api/emergency-requests`, then render returned request state and let an eligible caregiver call `/{id}/claim`. The API writes DB notifications; ThinQ push still needs the host app integration. |
| `tasks` completion sheet and `handoff` list | The existing completion POST already sends `note`. A nonempty note now creates a pending handoff to the primary caregiver, and its `briefing` includes the note so the current handoff list can show it after `/api/bootstrap` reloads. With bearer authentication, show the acknowledge button only when `handoff.to_member_id` is the current member. |

A new room needs its returned token on later API calls. For authenticated rooms, `/api/bootstrap` gives each caregiver only their own DB notifications and shows other caregivers' personal schedule titles as `바쁨`. The backend has no Google or Microsoft calendar OAuth flow, ThinQ host integration, or billing-provider verification yet. Before public deployment, replace local room sessions with account authentication, enforce member data permissions across every API, and verify subscriptions with the payment provider. Set `LGDX_REQUIRE_AUTH=1` to turn off anonymous access to the legacy demo room.

The AI assistant uses a domain instruction and current family schedules/care records in `app/ai.py`. It does not change assignments automatically. For further specialization, collect representative, consented examples, evaluate answers and action proposals, then consider retrieval or fine-tuning if prompt and data grounding are insufficient.

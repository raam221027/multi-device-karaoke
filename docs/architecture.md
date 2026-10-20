# Architecture

Browser-based karaoke for multiple phones. The host runs the room from a phone, guests join by QR code or room code, and a separate display device (a laptop connected to a TV) plays YouTube karaoke videos. All parts talk to a cloud backend, so each device can be on a different network.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS v4, TanStack Query, React Router |
| Backend | Laravel 12 REST API (PHP 8.2+) |
| Auth | Laravel Sanctum personal access tokens, one per device, with the role as the token ability |
| Real-time | Laravel Reverb (Pusher protocol) + Laravel Echo |
| Database | MySQL |
| Playback | YouTube IFrame Player API (display device only) |
| Search | YouTube Data API v3, called by the server only |

## Rules everything follows

1. **The server owns all state.** Clients change state through REST. The server checks permissions, writes to MySQL, then broadcasts an event. WebSockets only carry notifications.
2. **Only the display plays video.** Phones show the queue and controls only.
3. **Every state change increments `rooms.version`.** Events carry the version. If a client sees a gap, or reconnects, it fetches `GET /api/rooms/{room}/state` again.

## Identity

Each device in a room is a **participant** with role `host`, `guest` or `display`. After it joins, it gets a Sanctum token whose ability is its role. The same token authenticates REST calls and private-channel auth (`/broadcasting/auth`).

### Joining: room code only (no PIN)

Guests join with the room code alone, by scanning the QR code (`/join/{code}`) or typing it, plus a display name. Since the code is the only credential, it's protected by:

- **Entropy:** 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 symbols, about 887M combinations).
- **Rate limiting** on join and code lookups, per IP.
- Codes only work while the room is **open**.
- The host can **lock** the room (no new joins) and **regenerate** the code. Guests already in the room keep their sessions.
- Optional **guest approval** (`requires_approval`).
- **Kick** revokes the guest's token.

### Room API (Phase 1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/rooms` | 10/min per IP | Create a room + host participant. Returns `{room, participant, token}` |
| GET | `/api/rooms/code/{code}` | 20/min per IP (shared with join) | Preview a code: `{id, code, joinable, is_locked, requires_approval}`. 404 if unknown or closed |
| POST | `/api/rooms/join` | 20/min per IP (shared) | `{code, display_name}` creates a guest. 404 unknown/closed, 423 locked |
| GET | `/api/me` | token | Current participant + room (resume after reload) |
| GET | `/api/rooms/{room}/state` | token, member of room | Room (with `version`), approved participants, `me` |
| POST | `/api/rooms/{room}/leave` | `guest` token | Revoke this device's token |
| POST | `/api/rooms/{room}/close` | `host` token | Close the room, bump version, revoke every token in the room |

Typed codes are normalized (uppercase, spaces and dashes removed) on both client and server. Tokens expire after 24 hours. Until Phase 3, pages poll `/state` every 4 seconds.

### Host and queue API

The host sings like any guest: Live, Queue and Search are the same screens for every phone, and host-only controls are layered on top. Host-only room switches (`allow_song_additions`, a guest's `can_add_songs`) never block the host.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/rooms/display` | 20/min per IP (shared with join) | `{code, device?}` connects any browser as the room's `display`, named after its device (`Mobile`, `Tablet`, `PC`, `TV`; else `Screen`) and shown as "PC - Display". A phone that becomes the display shows as "Ana - Display". A new display replaces the old one, which is how the host switches screens: a screen that joined by code is revoked, while a phone that was the screen goes back to being a guest with the same token. 423 if locked |
| PATCH | `/api/rooms/{room}` | `host` | `{name, is_locked, allow_song_additions, guests_can_skip, show_side_strip}` |
| PATCH | `/api/rooms/{room}/participants/{p}` | `host` | `{can_add_songs}` |
| DELETE | `/api/rooms/{room}/participants/{p}` | `host` | Remove a guest or the display: revokes its token and drops its *waiting* songs (a song already playing finishes) |
| POST | `/api/rooms/{room}/participants/{p}/make-host` | `host` | Hand the room to a guest. The old host becomes a guest and keeps their songs. Both tokens keep working; only their ability changes. 422 for the display or the host |
| POST | `/api/rooms/{room}/use-as-display` | `guest` | A guest phone connects itself as the display (same token, new ability), so one device is never two participants. The client uses it instead of `/rooms/display` when the browser already has a guest session in that room. 204 |
| POST | `/api/rooms/{room}/participants/{p}/make-display` | `host` | Turn a guest's phone into the display. Same token, new ability; the phone opens the display page on its next poll. 204. 422 for the host or the display |
| POST | `/api/rooms/{room}/become-display` | `host` | `{participant_id}`: hand host to a guest or to the current display (a swap) and make this device the display, atomically. Roles change in place: every token keeps working with its new ability. 204. 422 for the host itself |
| GET | `/api/rooms/{room}/search?q=&karaoke=1` | `host`/`guest`, 10/min per participant | YouTube search proxy |
| POST | `/api/rooms/{room}/queue` | `host` always; `guest` if allowed | `{youtube_video_id}`. The server fetches the video's metadata itself |
| DELETE | `/api/rooms/{room}/queue/{item}` | `host`, or the guest who added it | Waiting songs only |
| PUT | `/api/rooms/{room}/queue/order` | `host` | `{item_ids}`: must be exactly the waiting songs (409 if the queue changed) |
| POST | `/api/rooms/{room}/playback/skip` | `host`; `guest` if `guests_can_skip` | `{queue_item_id}` |
| POST | `/api/rooms/{room}/playback/pause`, `/resume` | `host` | The display follows `room.playback_status` |
| POST | `/api/rooms/{room}/playback/started`, `/ended` | `display` | `{queue_item_id}`, plus `reason: ended|error` for ended |

`GET /state` also returns `queue {current, upcoming}`, `display_connected` and `server_time` (phones compute elapsed song time from `started_at`, `paused_at` and `paused_seconds` against the server clock).

### Display connection

The display opens `/display` and enters the room code, the same credential guests use, and gets a token with the `display` ability. It keeps that token separately from any phone session in the same browser. It plays the current song in the IFrame player, reports `started`/`ended`/`error` with the item id, and shows the invite QR between songs. It polls `/state` every 2 seconds so pause and skip feel immediate. (This replaces the earlier pairing-code plan.)

Any browser can be the display: a TV, laptop, tablet, or a spare phone when the party has nothing bigger. The host's TV invite page shows a second QR, `/display?code={code}`, which opens the display page with the code filled in. The device still has to tap **Connect**, because that tap unlocks audio and prevents a stray scan from replacing the current display. The home page also links to `/display` ("Use this device as the screen"). This link carries the same room code guests use, so it adds no new credential, and the `room-code` throttle and the 423 response for locked rooms still apply. On touch devices, Connect and "Tap to start" also request fullscreen and a landscape lock (Android), a tap shows a fullscreen toggle for a few seconds (iPhone shows an Add to Home Screen tip instead, since Safari has no fullscreen for pages), and the display holds a Screen Wake Lock while it's running.

**Switching screens.** The host's screen page shows whether the Display is connected and how to move playback: connect another device and it replaces the current one, which goes back to its connect screen with a notice. **The room always has a host.** A phone that is hosting can't also be the display. "Use this device as the screen" first asks who hosts next: a guest phone, or the current display, which swaps roles with the host. `become-display` changes both roles in one transaction and replaces any other display. Nobody gets a new token or is disconnected. Each device sees its new role on its next poll (a few seconds) and moves to the matching page: a phone whose role is now `display` moves its token into the display session and opens `/display`, and a display whose role is now `host` moves its token into the phone session and opens `/host/{id}`. Locked rooms are allowed, because the host is already authenticated. If a hosting phone opens `/display` some other way, for example by scanning the display QR, it shows "hand off hosting first" instead of the Connect form.

### Handing off host

The host can make any guest the host (Guests → Make host). Roles live on the participant and in the token's ability, so the server swaps both in one locked transaction and bumps the version. Nobody gets a new token. On the next poll each phone's `RoomLayout` sees its new role and moves to the matching screens. To move hosting to another of your own phones, join from it as a guest first, then make it the host. Guests can't claim the role themselves.

## Data model

```
rooms             id, code, name, status[open|closed], is_locked, requires_approval,
                  allow_song_additions, guests_can_skip, show_side_strip, current_queue_item_id,
                  playback_status[playing|paused], paused_at, paused_seconds,
                  version, closed_at, timestamps
participants      id, room_id, role, display_name, status[pending|approved|rejected|kicked],
                  can_add_songs, last_seen_at, timestamps
queue_items       id, room_id, added_by_participant_id, youtube_video_id, title,
                  channel_title, thumbnail_url, duration_seconds, position,
                  status[queued|playing|played|skipped|removed|failed], started_at, ended_at
```

## Queue and playback

- Adding a song only appends it. If the room is idle, the server starts it. A song that's playing is never interrupted.
- Song end, skip and video error requests all include the `queue_item_id` they refer to. The server advances inside a transaction with `lockForUpdate()` on the room, and only if that item is still the current song. This makes them idempotent and prevents double-advancing.
- Browsers block audio until someone interacts with the page, so the display shows a one-time "Tap to start".
- Broadcast events are dispatched after the database transaction commits.

## Channels (planned)

- `private-room.{id}`: approved members + display
- `private-room.{id}.host`: host only (join requests)
- `private-participant.{id}`: approval and kick notices for a single device

## YouTube quota

`search.list` costs 100 units, and the default quota is 10,000 units a day (about 100 searches). Searches go through the backend, which caches results by normalized query and limits searches per participant.

## Roadmap

0. Scaffold ← *done*
1. Rooms: create, join, close; Sanctum role tokens ← *done*
2. Queue + idempotent advance and skip ← *done*
3. Reverb real-time + versioned refetch
4. Display (room-code connect) + IFrame player ← *done*
5. YouTube search proxy (cache + rate limits) ← *done*
6. Kick, lock, song permissions, host dashboard ← *done* (guest approval still to do)
7. Multi-network testing over Cloudflare Tunnel, hardening
8. Production deploy (Vercel frontend, Railway backend + MySQL, Reverb as a second Railway service)

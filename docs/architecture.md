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

### Display pairing

The display opens `/display` and gets a single-use pairing code (expires in 5 minutes) plus a secret it keeps to itself. The host enters the code. The display polls `GET /api/pairings/{id}` with its secret and receives a token with the `display` ability.

## Data model (planned)

```
rooms             id, code, status[open|closed], is_locked, requires_approval,
                  current_queue_item_id, version, closed_at, timestamps
participants      id, room_id, role, display_name, status[pending|approved|rejected|kicked],
                  last_seen_at, timestamps
queue_items       id, room_id, added_by_participant_id, youtube_video_id, title,
                  channel_title, thumbnail_url, duration_seconds, position,
                  status[queued|playing|played|skipped|removed|failed], started_at, ended_at
display_pairings  id, code, secret_hash, room_id, participant_id, expires_at, paired_at
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
1. Rooms: create, join, close; Sanctum role tokens
2. Queue + idempotent advance and skip
3. Reverb real-time + versioned refetch
4. Display pairing + IFrame player
5. YouTube search proxy (cache + rate limits)
6. Guest approval, kick, lock, host dashboard
7. Multi-network testing over Cloudflare Tunnel, hardening
8. Production deploy (Nginx + Reverb proxy, Supervisor, TLS)

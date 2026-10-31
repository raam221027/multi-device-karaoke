# YouTube API quota extension: notes for the form

Draft answers for the [YouTube API Services quota extension form](https://support.google.com/youtube/contact/yt_api_form). Replace the `[…]` parts with real values before sending.

## The app

- **Name:** Videokehan
- **URL:** https://videokehan.com
- **Privacy policy:** https://videokehan.com/privacy
- **Terms of use:** https://videokehan.com/terms
- **Contact:** raam221027@gmail.com
- **What it does:** a free, browser-based karaoke app for house parties. One device (TV, laptop, tablet or spare phone) plays karaoke videos in the YouTube IFrame player; guests join from their phones by scanning a QR code, search for songs and add them to a shared queue. No accounts, no ads, no downloads.
- **Who uses it:** friends and families at home karaoke parties, mostly in the Philippines.

## Which API calls, and why

| Call | Cost | When |
|---|---|---|
| `search.list` (`type=video`, `videoEmbeddable=true`, `maxResults=10`) | 100 | A guest submits a search, taps "More", or a song's video fails to play on the TV and the app looks for another upload of the same song. |
| `videos.list` (`part=snippet,contentDetails,status`, up to 10 ids) | 1 | Once per search page, for duration, embeddability and age restriction; and when a song is added, to check the chosen video. |

Only API keys are used, with no OAuth and no user data from YouTube. Videos play in the official IFrame player and are never downloaded or changed.

## How the app saves quota

- **Search only on submit.** Suggestions while typing come from the free iTunes Search API, not YouTube.
- **Shared cache.** Every room shares a server-side cache. A search page and its video details are kept for 7 days, keyed by the normalized query, so "Alapaap!", "alapaap" and "Karaoke Alapaap" are one search.
- **Popular songs** on the search screen come from 6 searches refreshed once a week for all rooms.
- **10 results per search page.** A song search usually wants one of the first few hits, and a smaller page returns faster. "More" fetches the next 10, and each page is cached like any search.
- **Rate limits:** 10 searches a minute per guest.
- **Daily budget guard:** the server counts units per Pacific day and stops new searches at 95% of the quota. When search is paused, cached searches, popular songs and adding songs keep working, and guests see "Song search is resting until tomorrow." A `quotaExceeded` answer also pauses search until midnight Pacific instead of retrying.
- **Alternate videos** are searched only after a real playback failure reported by the TV.

## Compliance

- **Player not covered:** while a song plays, the video has its own area and the QR code, singer and next song sit in a strip beside it. Nothing is drawn over the player.
- **Attribution:** results are labelled "YouTube" and the footer says "Karaoke videos powered by YouTube".
- **Data retention:** search results and video details are cached at most 7 days. Rooms closed or idle for 30 days are deleted with their guests and songs (`php artisan rooms:prune`, which also runs automatically), so API data is never kept over 30 days.
- **Privacy policy** explains the use of YouTube API Services and links to the Google Privacy Policy; the **terms** bind users to the YouTube Terms of Service.

## Quota needed

Run `php artisan youtube:usage` on the server (Railway shell) at the end of a busy day for the real numbers: units used, YouTube searches, searches served from cache, and the cache hit rate.

Estimate per party (replace with measured numbers):

- About [15] guests adding about [3] songs each is about [45] songs.
- About [1.5] searches per song is about [65] searches, including "More" taps. (Pages are 10 results, so measure this with `php artisan youtube:usage` rather than guessing: "More" may be tapped a little more often than with 20.)
- With a [40]% cache hit rate, that's about [40] YouTube searches × 101 units, about **[4,000] units per party**.

The default 10,000 units covers about [2] parties a day. To support [25] parties a day, request **[100,000] units per day**.

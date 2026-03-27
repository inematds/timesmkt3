# Publish Advisory: pascoa_coldbrew — 2026-03-26

## Status

- [ ] Instagram — Ready to publish
- [ ] YouTube — Pending video render (see notes below)
- [ ] Threads — Ready to publish

---

## Media Assets

| File | Platform | Public URL |
|---|---|---|
| pascoa_coldbrew_2026-03-26_instagram_ad.png | Instagram | https://gqjcmirjmdaedrtpatgo.supabase.co/storage/v1/object/public/campaign-uploads/pascoa_coldbrew_2026-03-26_instagram_ad.png |
| ad.mp4 (not yet rendered) | YouTube | — Remotion render required before upload |

> **Note:** The Video Ad Specialist produced `outputs/pascoa_coldbrew_2026-03-26/video/scene_plan.json` with a full scene breakdown, but the Remotion render (`ad.mp4`) has not been executed. Run `npm run render` (or invoke Remotion CLI) against `video/scene_plan.json` to generate the video before YouTube publishing.

---

## Instagram

**Caption:**

Your Easter morning just got a serious upgrade. ☕

Cold brew: smooth, low-acid, and ready before the egg hunt starts.

Upgrade Your Morning →

#ColdBrewCoffeeCo #PascoaColdBrew #EasterCoffee #ColdBrew #MorningFuel

**Media URL:** https://gqjcmirjmdaedrtpatgo.supabase.co/storage/v1/object/public/campaign-uploads/pascoa_coldbrew_2026-03-26_instagram_ad.png

**Format:** Feed Post — 1080×1080 px (1:1)

**Compliance check:**
- Hook present: ✓ ("Your Easter morning just got a serious upgrade.")
- Value/vibe line: ✓ ("smooth, low-acid, and ready before the egg hunt starts.")
- CTA present: ✓ ("Upgrade Your Morning →") — approved CTA pattern
- Emojis: ✓ (1 — ☕ from approved set)
- Hashtags: ✓ (5 — brand + product + lifestyle + occasion mix)

**Recommended post time:** Saturday 2026-03-28 at 9:00 AM (local)

---

## YouTube

**Title:** Upgrade Your Easter Morning with Cold Brew | Cold Brew Coffee Co.

> Character count: 64 — within 60–70 character target ✓

**Description:**

This Easter, discover why cold brew is the smoothest upgrade to your morning ritual. Low acidity, no bitterness, and ready-to-drink — Cold Brew Coffee Co. is the premium Easter gift that actually gets used. Shop now at [link].

**Tags:** cold brew Easter, Easter morning routine, cold brew coffee, smooth coffee morning, Easter coffee gift, ready-to-drink coffee Easter, craft cold brew

**Video URL:** — Pending Remotion render of `video/scene_plan.json`

**Compliance check:**
- Title length: ✓ (64 chars)
- No emojis in title: ✓
- Description ends with CTA: ✓ ("Shop now at [link].")
- Tags include seasonal + product keywords: ✓

**Recommended upload time:** Friday 2026-03-27 at 12:00 PM — upload 24h before target Easter Sunday visibility peak (publish visibility window: Saturday 2026-03-28 12:00 PM)

> YouTube requires the Remotion-rendered `ad.mp4` to proceed. Once rendered, upload to Supabase using `node pipeline/supabase-upload.js pascoa_coldbrew 2026-03-26 outputs/pascoa_coldbrew_2026-03-26/video/ad.mp4`, then update `media_urls.json` and this file with the resulting public URL.

---

## Threads

**Post:**

Hot coffee on Easter? Life's too short for that.

Cold brew your morning — smooth, ready-to-drink, zero bitterness.

Your Easter just got an upgrade. ☕

**Character count:** 142 — within 500-character limit ✓

**Compliance check:**
- Tone: ✓ (witty, casual, no hard sell)
- Length: ✓ (3 short sentences)
- Emojis: ✓ (1 — ☕ from approved set)
- No leading hashtags: ✓
- Sounds human, not like an ad: ✓

**Recommended post time:** Thursday 2026-03-26 at 8:00 PM (local) — pre-Easter buzz window, research confirms Thursday 8PM as a top Threads engagement slot for this campaign

> Threads does not support programmatic publishing via a public API. Copy the post text above and post manually via the Threads app or web interface.

---

## Scheduling Notes

Research data shows Instagram engagement for Easter F&B content peaks **mid-March through Easter Sunday**, with social buzz confirmed at 70% positive sentiment. The Saturday 9AM Instagram window aligns with the "morning upgrade" campaign angle — targeting consumers before the Easter day begins. Threads Thursday evening pre-post primes awareness 48 hours out, capitalizing on the research insight that Easter social buzz is highest in the days leading up to the holiday. YouTube is scheduled for Friday midday upload to maximize visibility during the Saturday–Sunday Easter weekend viewing peak, consistent with the platform guideline of uploading 24h before target reach.

The "Easter Morning, Upgraded" angle selected from research marketing angles connects directly to the consumer insight that 69% of Easter celebrators plan food purchases for the holiday, and millennials are the most likely generation to give Easter gifts — positioning cold brew as the premium, practical, zero-risk Easter gift.

---

## Execution Instructions

To trigger publishing, reference this file explicitly in your message.

Example: `"Run Publish pascoa_coldbrew 2026-03-26.md"`

Publishing will NOT execute without this explicit reference.

---

## Completion Log

- [x] Media uploaded to Supabase (`instagram_ad.png` — public URL verified)
- [x] Public URLs verified
- [x] Metadata assembled (Instagram, Threads, YouTube)
- [x] Publish MD generated
- [ ] Video rendered (Remotion render of `scene_plan.json` pending)
- [ ] Video uploaded to Supabase (pending render)
- [ ] Posts published (pending user approval via explicit Publish MD reference)

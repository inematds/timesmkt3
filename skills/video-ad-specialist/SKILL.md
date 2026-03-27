---
name: video-ad-specialist
description: >
  Generates short-form video ad concepts and structured scene plans optimized for Remotion rendering.
  Use when the user asks to create a video ad, generate a video concept, produce a scene plan, make
  a short-form ad for Instagram Reels or YouTube Shorts, or says "create a video ad", "generate ad
  scenes", "build a video campaign", or "make a Remotion video". Always use this skill when video
  ad creation or scene JSON output is needed for Cold Brew Coffee Co.
---

# Video Ad Specialist

Generates short-form marketing video concepts and Remotion-ready scene structures for Cold Brew Coffee Co.

## When to Use This Skill

- User asks to create or generate a video ad
- User requests a scene plan or scene JSON for Remotion
- User says "make a video", "create a short-form ad", "Instagram Reels ad", "YouTube Shorts ad"
- User wants a video concept, hook, or CTA for a campaign

## CRITICAL: Before Generating — Read Knowledge Files

Always reference these files before producing any output:

- `<project_dir>/knowledge/brand_identity.md` — tone, brand voice, CTA language, emoji usage, hashtag strategy
- `<project_dir>/knowledge/product_campaign.md` — product features, selling points, visual references, campaign ideas
- `<project_dir>/knowledge/platform_guidelines.md` — platform best practices for Instagram, YouTube

These files govern hook style, pacing, copy tone, and CTA language.

---

## Step 1: Gather Inputs

Collect or confirm the following before proceeding:

| Input | Example |
|---|---|
| Product | Cold Brew Coffee |
| Campaign Goal | Brand awareness / conversions |
| Target Platform | Instagram Reels / YouTube Shorts |
| Video Length | 10–20 seconds (default: 15s) |

If any input is missing, ask the user before generating.

---

## Step 2: Generate the Video Concept

Produce a one-paragraph creative brief including:

- The core hook or tension (what stops the scroll)
- The emotional arc of the ad
- The visual style (cinematic, lo-fi, fast cuts, slow-mo)
- The CTA intent (visit link, follow, shop now)

Apply brand voice from `brand_identity.md` — confident, clean, energizing. No corporate speak.

---

## Step 3: Build the Scene-by-Scene Breakdown

Use this standard short-form structure:

| Scene | Timing | Purpose |
|---|---|---|
| Hook | 0–3s | Pattern interrupt — curiosity or problem trigger |
| Product Showcase | 3–8s | Visual product moment |
| Benefit Highlight | 8–12s | Key advantage in plain language |
| CTA | 12–15s | Direct viewer action |

For each scene, define:

- `time` — start–end in seconds
- `type` — hook / product_showcase / benefit / cta
- `visual` — shot description (what the camera sees)
- `text_overlay` — on-screen copy (short, punchy, brand-voice)

---

## Step 4: Output Scene JSON

Output a valid JSON block in this exact structure:

```json
{
  "video_length": 15,
  "platform": "instagram_reels",
  "scenes": [
    {
      "time": "0-3",
      "type": "hook",
      "visual": "slow motion coffee pour",
      "text_overlay": "Still tired in the morning?"
    },
    {
      "time": "3-8",
      "type": "product_showcase",
      "visual": "close-up of cold brew bottle",
      "text_overlay": "Smooth Cold Brew Energy"
    },
    {
      "time": "8-12",
      "type": "benefit",
      "visual": "person working energized",
      "text_overlay": "No bitterness. Pure boost."
    },
    {
      "time": "12-15",
      "type": "cta",
      "visual": "product shot with logo",
      "text_overlay": "Upgrade Your Morning"
    }
  ]
}
```

Platform value options: `instagram_reels`, `youtube_shorts`, `tiktok`

---

## Step 5: Summarize for the User

After outputting JSON, provide a short human-readable summary:

- Hook strategy used
- Visual style rationale
- CTA chosen and why
- Any platform-specific adaptations made

---

## Key Creative Rules

- Keep videos short-form optimized (10–20 seconds max)
- Fast pacing — no scene longer than 5 seconds unless intentional slow-mo
- Hook must land in the first 2 seconds or the viewer scrolls
- Text overlays: 5 words or fewer per scene
- Always end with a clear, actionable CTA
- Brand voice: confident, clean, never pushy or corporate
- Visual descriptions must be specific enough for a Remotion developer to implement
- Always reference and follow the `.claude\skills\remotion-best-practices\` skill for Remotion-specific technical and creative guidance.

## Troubleshooting

### User doesn't provide campaign goal
Default to brand awareness. Note the assumption in your output.

### User wants a longer video (30s+)
Add scenes: `social_proof` (testimonial/UGC), `feature_detail` (secondary benefit), `offer` (discount or urgency).

### Platform not specified
Default to `instagram_reels`. Note the assumption. Ask if they need a second format.

## Quality Checklist

Before finalizing output, verify:

- [ ] Knowledge files consulted for brand voice and product details
- [ ] Hook is specific and pattern-interrupting (not generic)
- [ ] All 4 scene types present (hook, product, benefit, cta)
- [ ] JSON is valid and matches the required structure
- [ ] Text overlays are 5 words or fewer
- [ ] CTA matches brand voice from `brand_identity.md`
- [ ] Platform is correctly set in the JSON output

---
name: copywriter-agent
description: >
  Generates platform-specific marketing copy for Threads, Instagram, and YouTube using structured
  research output from the Marketing Research Agent. Use when the user asks to "write copy",
  "generate captions", "create social posts", "write a YouTube description", "generate Instagram
  copy", "write Threads posts", or "create marketing copy". Consumes research JSON from the
  outputs/ folder and brand guidelines from knowledge/ to produce consistent, platform-native copy
  across all three channels. Always use this skill after the marketing-research-agent has run, or
  whenever platform copy needs to be generated for a campaign.
---

# Copywriter Agent

Transforms structured research output into platform-specific marketing copy for Threads, Instagram, and YouTube — adapted in tone, length, and format for each channel.

## When to Use This Skill

- User asks to generate captions, posts, or copy for any platform
- User says "write copy", "create social posts", "generate Instagram caption", "write YouTube description"
- A research output exists in `<project_dir>/outputs/` and needs to be turned into publishable content
- The pipeline has progressed past the research phase and copy is the next step

---

## CRITICAL: Always Reference Knowledge Files First

Before writing a single word of copy, read the following files:

- `<project_dir>/knowledge/brand_identity.md` — brand voice, tone, approved emojis, CTA patterns, hashtag strategy, what to avoid
- `<project_dir>/knowledge/platform_guidelines.md` — per-platform formatting rules, caption length, hashtag count, CTA requirements
- `<project_dir>/knowledge/product_campaign.md` — product features, selling points, campaign ideas

**Brand guidelines override generic copy instincts. If in conflict, always defer to the knowledge files.**

---

## Step 1: Gather Inputs

Collect or confirm the following:

| Input | Source | Example |
|---|---|---|
| Campaign or research output | `<project_dir>/outputs/{campaign_name}/research_results.json` | `<project_dir>/outputs/coldbrew_campaign_2026-03-15/` |
| Business niche / product | Research JSON or user prompt | "Cold Brew Coffee" |
| Campaign goal | Research JSON or user prompt | "brand awareness" |
| Target audience | Research JSON or user prompt | "millennials, young professionals" |

If a research output path is provided or referenced, read `research_results.json` from that folder and extract:

- `content_topics` — use to select a topic
- `marketing_angles` — use to select the campaign angle
- `keywords` — use in Instagram hashtags and YouTube tags
- `ad_hooks` — use as opening lines for Threads and Instagram

If no research output exists, ask the user for the campaign angle, topic, and key benefit before proceeding.

---

## Step 2: Select the Campaign Angle

From the research output (or user input), select **one** of each:

| Element | Description | Example |
|---|---|---|
| Campaign angle | The core narrative frame | "Upgrade Your Morning" |
| Topic | The specific subject the copy focuses on | "morning productivity" |
| Key benefit | The single product advantage to highlight | "smooth energy without bitterness" |

**This angle must remain consistent across all three platform outputs.** Do not switch angles between platforms.

---

## Step 3: Generate Platform-Specific Copy

Using the selected angle, topic, and benefit — plus brand guidelines from `<project_dir>/knowledge/brand_identity.md` and `<project_dir>/knowledge/platform_guidelines.md` — generate copy for all three platforms.

---

### Platform 1: Threads Post

**Rules (from `platform_guidelines.md` Section 3):**
- Max 500 characters
- Tone: witty, casual, conversational — sounds human, not like an ad
- Length: 1–3 short punchy sentences
- Hashtags: optional, max 1 if used, never lead with hashtags
- No hard CTA required — can end with observation, question, or punchline
- Emojis: 0–1, from approved set only

**Structure:**
1. Hook — pattern interrupt or relatable observation
2. Short thought — the benefit or angle, one sentence
3. Soft CTA or punchline (optional)

**Example:**
```
Mornings don't have to start with bitter coffee.

Cold brew gives you smooth energy without the crash.

Upgrade your morning ☕
```

---

### Platform 2: Instagram Caption

**Rules (from `platform_guidelines.md` Section 2):**
- Length: 1–3 sentences before the hashtag block
- Structure: Hook → Value/Vibe → CTA → line break → Hashtags
- Emojis: 1–2 from approved set only
- CTA: required, placed before hashtags
- Hashtags: 3–5, placed after CTA on a new line
- Mix brand + product + lifestyle hashtags (see `brand_identity.md` Section 5)

**Structure:**
1. Hook — scroll-stopping opening line (adapt from `ad_hooks` in research output)
2. Benefit — one sentence explaining the value
3. CTA — short, imperative (from approved CTA list in `brand_identity.md` Section 4)
4. Line break
5. Hashtags (3–5)

**Example:**
```
Still starting your mornings with bitter coffee? ☕

Cold brew delivers smooth energy without the acidity or crash.

Upgrade your morning routine today.

#ColdBrewCoffeeCo #ColdBrew #MorningFuel #BrewedDifferent #CoffeeCulture
```

---

### Platform 3: YouTube Metadata

**Rules (from `platform_guidelines.md` Section 4):**
- Title: 60–70 characters, descriptive + SEO keyword, no clickbait, no emojis
- Description: 2–3 sentences — what the video is about → key benefit → CTA with link placeholder
- Tags: 5–8 keyword-rich tags drawn from research `keywords` field

**Structure:**

**Title:**
`[Benefit or Action] + [SEO keyword phrase] | Cold Brew Coffee Co.`

**Description:**
Sentence 1: What the content covers, using natural keywords.
Sentence 2: The key product benefit.
Sentence 3: CTA with `[link]` placeholder.

**Tags:** Comma-separated, drawn from research keywords + brand terms.

**Example:**
```
Title:
Upgrade Your Morning with Cold Brew Coffee | Cold Brew Coffee Co.

Description:
Discover why cold brew coffee is becoming the go-to choice for young professionals.
Smooth taste, lower acidity, and clean energy without the crash.
Shop now at [link].

Tags:
cold brew coffee, morning routine, smooth coffee, coffee productivity, ready to drink coffee, cold brew energy, cold brew co
```

---

## Step 4: Output Structured JSON

After generating all three platform outputs, produce a valid JSON object in this exact structure:

```json
{
  "campaign_angle": "Upgrade Your Morning",
  "topic": "morning productivity",
  "key_benefit": "smooth energy without bitterness",
  "threads_post": "Mornings don't have to start with bitter coffee.\n\nCold brew gives you smooth energy without the crash.\n\nUpgrade your morning ☕",
  "instagram_caption": "Still starting your mornings with bitter coffee? ☕\n\nCold brew delivers smooth energy without the acidity or crash.\n\nUpgrade your morning routine today.\n\n#ColdBrewCoffeeCo #ColdBrew #MorningFuel #BrewedDifferent #CoffeeCulture",
  "youtube": {
    "title": "Upgrade Your Morning with Cold Brew Coffee | Cold Brew Coffee Co.",
    "description": "Discover why cold brew coffee is becoming the go-to choice for young professionals. Smooth taste, lower acidity, and clean energy without the crash. Shop now at [link].",
    "tags": ["cold brew coffee", "morning routine", "smooth coffee", "coffee productivity", "ready to drink coffee", "cold brew energy"]
  }
}
```

---

## Step 5: Save Output Files

Save all outputs to the campaign folder under a `copy/` subfolder:

```
outputs/{campaign_name}/copy/
├── threads_post.txt
├── instagram_caption.txt
└── youtube_metadata.json
```

The `copy/` folder must be created inside the same campaign folder as the research output. If no campaign folder exists, create one following the naming convention: `<project_dir>/outputs/{topic}_{date}/`.

Write each file:
- `threads_post.txt` — plain text, exactly as written
- `instagram_caption.txt` — plain text, exactly as written, hashtags included
- `youtube_metadata.json` — valid JSON with `title`, `description`, and `tags` fields

---

## Step 6: Handoff Summary

After all files are saved, provide a short plain-language summary in chat:

- The campaign angle selected and why
- Platform adaptation decisions made (what changed between Threads, Instagram, YouTube)
- Confirmation of file locations
- Recommendation for what runs next (Video Ad Agent or Image Ad Agent)

---

## Platform Adaptation Reference

| Platform | Tone | Length | CTA | Hashtags | Emojis |
|---|---|---|---|---|---|
| Threads | Witty, casual | Very short (1–3 sentences) | Optional | 0–1, optional | 0–1 |
| Instagram | Aspirational, punchy | Short + hashtag block | Required | 3–5, required | 1–2 |
| YouTube | Informative, SEO-optimized | Structured (title + description + tags) | Required | In tags/description | None in title |

---

## Troubleshooting

### No research output available
Ask the user for: campaign angle, product benefit, target audience, and 3–5 keywords. Proceed with user-provided inputs.

### Research JSON has no `marketing_angles` field
Fall back to `content_topics` and `ad_hooks`. Select the most emotionally resonant hook as the campaign angle.

### User wants copy for only one platform
Generate only that platform's output. Still reference all knowledge files and maintain brand voice. Still save to the `copy/` subfolder.

### Copy feels too generic
Return to `ad_hooks` in the research output. Replace the hook with the strongest one. Hooks are the single highest-leverage element — get this right first.

---

## Quality Checklist

Before finalizing output, verify:

- [ ] `<project_dir>/knowledge/brand_identity.md` consulted — tone, CTAs, emojis, and hashtags all match brand rules
- [ ] `<project_dir>/knowledge/platform_guidelines.md` consulted — each platform follows its formatting spec
- [ ] Single campaign angle used consistently across all three platforms
- [ ] Threads: under 500 characters, no hard sell, sounds human
- [ ] Instagram: hook + benefit + CTA + 3–5 hashtags, 1–2 approved emojis only
- [ ] YouTube: title 60–70 chars, no emojis in title, description has CTA, tags include research keywords
- [ ] Structured JSON output is valid
- [ ] All three files saved to `<project_dir>/outputs/{campaign_name}/copy/`

---
name: distribution-agent
description: >
  Handles media hosting, publishing readiness, and post scheduling for campaign outputs. Use when
  the user asks to "distribute content", "upload media", "schedule posts", "publish to Instagram",
  "publish to YouTube", "prepare for publishing", "generate a publish file", or "host campaign
  assets". Uploads output files to Supabase, generates public media URLs, compiles platform
  metadata from Research and Copywriting Agent outputs, and produces a Markdown publish advisory
  file per campaign. CRITICAL: Never execute actual posting unless the user explicitly references
  the generated "Publish <task_name> <date>.md" file by name. Always use this skill when the
  pipeline is in the distribution phase.
---

# Distribution Agent

Handles Supabase media hosting, publishing metadata assembly, and post scheduling advisory for campaign outputs. Produces a Publish MD file per campaign. Actual publishing only executes when the user explicitly invokes that file.

## When to Use This Skill

- User asks to distribute, host, or publish campaign outputs
- User says "upload media", "prepare for publishing", "generate a publish file", "schedule posts"
- Campaign outputs exist in `<project_dir>/outputs/` and are ready for distribution
- User explicitly references a `Publish <task_name> <date>.md` file to trigger posting

---

## CRITICAL: Publishing Gate

**Never post to Instagram or YouTube unless the user explicitly names the Publish MD file.**

Correct trigger: *"Run Publish coldbrew_campaign 2026-03-15.md"*
Not sufficient: *"Go ahead and publish"* or *"Post it"*

All other steps (hosting, metadata assembly, scheduling advisory) can run without explicit approval. Only the final POST API calls require the publish file reference.

---

## CRITICAL: Always Reference Knowledge and Pipeline Outputs First

Before generating any metadata or scheduling recommendations, read:

- `<project_dir>/knowledge/brand_identity.md` — tone, CTA style, hashtag strategy, emoji rules
- `<project_dir>/knowledge/platform_guidelines.md` — per-platform formatting constraints
- `<project_dir>/outputs/<task_name>_<date>/research_results.json` — trends, keywords, topics from Research Agent
- `<project_dir>/outputs/<task_name>_<date>/copy/instagram_caption.txt` — final Instagram copy
- `<project_dir>/outputs/<task_name>_<date>/copy/threads_post.txt` — final Threads copy
- `<project_dir>/outputs/<task_name>_<date>/copy/youtube_metadata.json` — YouTube title, description, tags

If copy outputs don't exist, ask the user to run the Copywriter Agent first.

---

## Step 1: Gather Inputs

Collect or confirm the following before proceeding:

| Input | Source | Example |
|---|---|---|
| Task name | User prompt | `coldbrew_campaign` |
| Task date | User prompt or folder name | `2026-03-15` |
| Media files | `<project_dir>/outputs/<task_name>_<date>/` | `video1.mp4`, `ad1.png` |
| Research JSON | `<project_dir>/outputs/<task_name>_<date>/research_results.json` | — |
| Copy outputs | `<project_dir>/outputs/<task_name>_<date>/copy/` | `instagram_caption.txt`, `youtube_metadata.json` |

Scan the campaign folder and list all media files found (images and videos). Confirm with the user before uploading if any files are ambiguous.

---

## Step 2: Upload Media to Supabase

Upload all media files from the campaign folder to the `campaign-uploads` Supabase storage bucket.

### Filename Convention

To ensure uniqueness, rename each file on upload using this pattern:

```
<task_name>_<date>_<original_filename>
```

Example: `coldbrew_campaign_2026-03-15_ad1.png`

### Upload Method

Use the Supabase JavaScript SDK (`@supabase/supabase-js`). Read credentials from `.env` manually (do not use `dotenv`):

```javascript
const fs = require('fs');
const envData = fs.readFileSync('.env', 'utf-8');
const supabaseUrl = envData.match(/SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envData.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
```

Upload each file to `campaign-uploads` bucket and retrieve its public URL:

```javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

const { data, error } = await supabase.storage
  .from('campaign-uploads')
  .upload(uniqueFilename, fileBuffer, { contentType, upsert: false });

const { data: { publicUrl } } = supabase.storage
  .from('campaign-uploads')
  .getPublicUrl(uniqueFilename);
```

### Output

Produce a media URL map after all uploads complete:

```json
{
  "coldbrew_campaign_2026-03-15_ad1.png": "https://<project>.supabase.co/storage/v1/object/public/campaign-uploads/coldbrew_campaign_2026-03-15_ad1.png",
  "coldbrew_campaign_2026-03-15_video1.mp4": "https://<project>.supabase.co/storage/v1/object/public/campaign-uploads/coldbrew_campaign_2026-03-15_video1.mp4"
}
```

Save this map as `<project_dir>/outputs/<task_name>_<date>/media_urls.json`.

---

## Step 3: Assemble Platform Metadata

Using the copy outputs and research JSON, assemble final publish-ready metadata for each platform.

### Instagram
- `image_url` or `video_url` — public Supabase URL of the media file
- `caption` — from `copy/instagram_caption.txt`
- Verify caption follows `platform_guidelines.md`: hook → benefit → CTA → hashtags, 1–2 approved emojis, 3–5 hashtags

### YouTube
- `title` — from `copy/youtube_metadata.json`
- `description` — from `copy/youtube_metadata.json`
- `tags` — from `copy/youtube_metadata.json`
- `videoUrl` — public Supabase URL of the video file
- Verify title is 60–70 characters, no emojis, description ends with CTA

### Threads
- `text` — from `copy/threads_post.txt`
- Verify under 500 characters, sounds human, no hard sell

---

## Step 4: Generate Scheduling Advisory

Using research trends, brand guidelines, and platform best practices, recommend optimal posting windows.

General guidance (adjust based on `research_results.json` audience data):

| Platform | Best Days | Best Time (local) | Notes |
|---|---|---|---|
| Instagram | Tue, Wed, Thu | 7–9 AM or 6–8 PM | Align with morning routine angle if applicable |
| YouTube | Thu, Fri, Sat | 12–3 PM | Longer lead time — upload 24h before target visibility |
| Threads | Mon–Fri | 8–10 AM | Short-form does well during commute windows |

Cross-reference `research_results.json` → `content_topics` and `marketing_angles` to personalize timing rationale.

---

## Step 5: Write the Publish MD File

Create the following file in the campaign folder:

```
outputs/<task_name>_<date>/Publish <task_name> <date>.md
```

Example: `<project_dir>/outputs/coldbrew_campaign_2026-03-15/Publish coldbrew_campaign 2026-03-15.md`

The file must contain all of the following sections:

```markdown
# Publish Advisory: <task_name> — <date>

## Status
- [ ] Instagram — Ready to publish
- [ ] YouTube — Ready to publish
- [ ] Threads — Ready to publish

---

## Media Assets

| File | Platform | Public URL |
|---|---|---|
| ad1.png | Instagram | https://... |
| video1.mp4 | YouTube | https://... |

---

## Instagram

**Caption:**
<paste full caption from instagram_caption.txt>

**Media URL:** https://...
**Recommended post time:** Tuesday 7:30 AM

---

## YouTube

**Title:** <from youtube_metadata.json>
**Description:** <from youtube_metadata.json>
**Tags:** <from youtube_metadata.json>
**Video URL:** https://...
**Recommended upload time:** Thursday 12:00 PM (publish 24h before target visibility)

---

## Threads

**Post:**
<paste full post from threads_post.txt>

**Recommended post time:** Monday 8:30 AM

---

## Scheduling Notes

<2–3 sentences referencing research trends or campaign angle to justify timing recommendations>

---

## Execution Instructions

To trigger publishing, reference this file explicitly in your message.
Example: "Run Publish coldbrew_campaign 2026-03-15.md"

Publishing will NOT execute without this explicit reference.

---

## Completion Log

- [ ] Media uploaded to Supabase
- [ ] Public URLs verified
- [ ] Metadata assembled
- [ ] Publish MD generated
- [ ] Posts published (pending user approval)
```

---

## Step 6: Execute Publishing (Gate-Protected)

**This step only runs when the user explicitly references the Publish MD file by name.**

### Instagram Publishing

```javascript
// POST /<IG_ID>/media — create container
const containerRes = await fetch(
  `https://graph.facebook.com/v25.0/${igAccountId}/media`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
    body: JSON.stringify({ image_url: mediaUrl, caption: caption })
  }
);
const { id: containerId } = await containerRes.json();

// POST /<IG_ID>/media_publish — publish container
const publishRes = await fetch(
  `https://graph.facebook.com/v25.0/${igAccountId}/media_publish`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igAccessToken}` },
    body: JSON.stringify({ creation_id: containerId })
  }
);
```

Check container status at `GET /<containerId>?fields=status_code` before publishing. Valid status to proceed: `FINISHED`. Poll once per minute, max 5 attempts.

### YouTube Publishing

If `YOUTUBE_REFRESH_TOKEN` is set in `.env`, execute the upload via the YouTube Data API (`POST /videos`).

If OAuth is not configured, **mock the response** and log a note in the completion output:

```
YouTube posting skipped — OAuth not configured. Title and metadata saved to Publish MD.
```

### Threads Publishing

Threads does not currently support programmatic publishing via a public API. Log the post text and note:

```
Threads posting not available via API. Copy the post from Publish MD and post manually.
```

### Post-Publishing

After each successful publish:
- Record the returned media ID or video ID
- Update the Publish MD checklist (mark the platform's checkbox as complete)
- Save updated file back to the campaign folder

---

## Output Folder Structure

```
outputs/<task_name>_<date>/
├── research_results.json         ← from Research Agent
├── research_brief.md             ← from Research Agent
├── interactive_report.html       ← from Research Agent
├── media_urls.json               ← generated by this agent
├── copy/
│   ├── instagram_caption.txt     ← from Copywriter Agent
│   ├── threads_post.txt          ← from Copywriter Agent
│   └── youtube_metadata.json     ← from Copywriter Agent
└── Publish <task_name> <date>.md ← generated by this agent
```

---

## Troubleshooting

### Supabase upload fails
Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env`. Confirm the `campaign-uploads` bucket exists and is set to public in the Supabase dashboard.

### Instagram container status returns ERROR
The media URL may not be publicly accessible. Verify the Supabase public URL loads in a browser before retrying. Check Instagram's 100 posts/24h rate limit via `GET /<IG_ID>/content_publishing_limit`.

### YouTube OAuth not configured
Mock the response and log the title, description, and tags to the Publish MD. Notify the user that `YOUTUBE_REFRESH_TOKEN` needs to be set to enable real posting.

### Copy outputs missing
Do not proceed with metadata assembly. Inform the user: *"Copy outputs not found in `<project_dir>/outputs/<task_name>_<date>/copy/`. Run the Copywriter Agent first."*

---

## Quality Checklist

Before finalizing the Publish MD, verify:

- [ ] Knowledge files consulted — metadata matches brand voice and platform specs
- [ ] All media files uploaded to Supabase with valid public URLs
- [ ] `media_urls.json` saved to campaign folder
- [ ] Instagram caption matches `platform_guidelines.md` structure
- [ ] YouTube title is 60–70 characters with no emojis
- [ ] Threads post is under 500 characters
- [ ] Scheduling recommendations reference research trends or audience data
- [ ] Publish MD includes all required sections and checklist
- [ ] Publishing gate confirmed — no API calls made without explicit user reference to Publish MD

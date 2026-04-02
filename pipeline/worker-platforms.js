const fs = require('fs');
const path = require('path');

function createPlatformHandlers({
  projectRoot,
  runClaude,
}) {
  async function handleDistributionAgent(job) {
    const { task_name, task_date, output_dir, project_dir, platform_targets, language } = job.data;

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: Write the Publish MD file in Brazilian Portuguese (pt-BR).'
      : '';

    const adsDir = path.resolve(projectRoot, output_dir, 'ads');
    const videoDir = path.resolve(projectRoot, output_dir, 'video');
    const platformsDir = path.resolve(projectRoot, output_dir, 'platforms');
    const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];
    const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];
    const platformFiles = fs.existsSync(platformsDir) ? fs.readdirSync(platformsDir).filter(f => /\.json$/i.test(f)) : [];

    const prompt = `You are the Distribution Agent. Follow the skill defined in skills/distribution-agent/SKILL.md.

Task: Prepare the COMPLETE distribution package for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Output directory: ${output_dir}/
${langInstruction}

MEDIA FILES TO UPLOAD:
- Images: ${adFiles.length > 0 ? adFiles.map(f => `${output_dir}/ads/${f}`).join(', ') : 'none'}
- Videos: ${videoFiles.length > 0 ? videoFiles.map(f => `${output_dir}/video/${f}`).join(', ') : 'none'}

PLATFORM COPY (already produced by platform agents):
- ${platformFiles.length > 0 ? platformFiles.map(f => `${output_dir}/platforms/${f}`).join(', ') : 'none'}

STEPS:
1. UPLOAD — Run supabase-upload.js for EACH media file:
   node pipeline/supabase-upload.js ${project_dir} ${task_name} ${task_date} <file1> <file2> ...
   This uploads to the "campaign-uploads" bucket and saves ${output_dir}/media_urls.json with public URLs.

2. READ PLATFORM COPY — Read all JSON files from ${output_dir}/platforms/:
   - instagram.json — carousel caption, story sequence, reels caption, hashtags, scheduling
   - youtube.json — title, description, tags, thumbnail text, scheduling
   - threads.json — posts (main + thread + standalone), scheduling
   Also read the .md versions for human-readable summaries.

3. CHECK REWORK — If any platform JSON has "rework_needed" != null, log it as a warning in the Publish MD.

4. ASSEMBLE PUBLISH MD — Create: ${output_dir}/Publish ${task_name} ${task_date}.md
   Structure:
   - Status checklist (one checkbox per platform)
   - Media assets table (filename, platform, public URL from media_urls.json)
   - Instagram section (carousel + stories + reels — copy from instagram.json, URLs from media_urls.json)
   - YouTube section (per video — title, description, tags, video URL from media_urls.json)
   - Threads section (all posts from threads.json)
   - Scheduling calendar (combine scheduling from all platform JSONs into unified calendar)
   - Rework warnings (if any)
   - Execution instructions (reference this file by name to trigger publishing)

DO NOT publish to any platform. Only generate the Publish MD advisory file.
Publishing is ONLY triggered when the user explicitly references the Publish MD by name.`;

    await runClaude(prompt, 'distribution_agent', output_dir, 600000);
    return { status: 'complete', output: `${output_dir}/Publish ${task_name} ${task_date}.md` };
  }

  async function handlePlatformInstagram(job) {
    const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
    const absPlatformDir = path.resolve(projectRoot, output_dir, 'platforms');
    fs.mkdirSync(absPlatformDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const adsDir = path.resolve(projectRoot, output_dir, 'ads');
    const videoDir = path.resolve(projectRoot, output_dir, 'video');
    const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];
    const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];

    const prompt = `You are the Instagram Platform Agent — a specialist in Instagram content strategy.

Task: Create Instagram-ready copy for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, headlines, carousel_texts, story_texts, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction, guardrails
- ${project_dir}/knowledge/brand_identity.md — brand voice, approved CTAs, hashtag strategy, emojis
- ${project_dir}/knowledge/platform_guidelines.md — Instagram-specific rules and format constraints
- ${output_dir}/research_results.json — audience insights, best posting times, trending topics

VISUAL ASSETS PRODUCED (adapt your copy to complement these):
- Images in ${output_dir}/ads/: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}
- Videos in ${output_dir}/video/: ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}
- VIEW the images before writing — your captions must describe/complement what the viewer sees

YOUR JOB:
Transform the campaign narrative into Instagram-native copy. The MESSAGE comes from the narrative — you adapt tone, format, structure, and hashtags for Instagram. Your captions must work WITH the visuals, not ignore them.

OUTPUT — save to ${output_dir}/platforms/instagram.json:
{
  "carousel": {
    "caption": "main caption: hook in first line (before ...ver mais) + benefit + CTA + line breaks + 5-8 hashtags",
    "slide_captions": ["alt text / context per slide — describe what each image shows"],
    "hashtags": ["from brand_identity.md hashtag strategy"],
    "posting_notes": "best time, format tips"
  },
  "stories": {
    "sequence": [
      { "slide": 1, "image": "filename", "text_overlay": "from narrative story_texts", "cta": "swipe up / link", "sticker": "poll/quiz/emoji slider suggestion" }
    ],
    "posting_notes": "timing, frequency"
  },
  "reels": {
    "video": "video filename",
    "caption": "short punchy caption for video reel",
    "hashtags": ["relevant hashtags"],
    "audio_suggestion": "trending audio or original narration"
  },
  "scheduling": {
    "best_days": ["from research_results.json"],
    "best_times": ["from research_results.json"],
    "posting_order": "carousel first, then stories, then reel"
  },
  "rework_needed": null
}

REWORK: If any visual asset is unsuitable for Instagram (wrong aspect ratio, poor quality, missing format), set "rework_needed" to a description of what needs to change. Otherwise leave it null.

Also save ${output_dir}/platforms/instagram.md — human-readable version for review.

QUALITY RULES:
- Use ONLY approved CTAs and hashtags from brand_identity.md
- Caption hook must be in the FIRST LINE (before "...ver mais")
- Carousel caption: 2200 chars max
- Stories: bold, 1 message per story, suggest interactive stickers
- Reels caption: short, punchy, trending hashtags
- Match brand voice exactly — never generic`;

    await runClaude(prompt, 'platform_instagram', output_dir, 600000);
    return { status: 'complete', output: `${output_dir}/platforms/instagram.json` };
  }

  async function handlePlatformYouTube(job) {
    const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
    const absPlatformDir = path.resolve(projectRoot, output_dir, 'platforms');
    fs.mkdirSync(absPlatformDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const videoDir = path.resolve(projectRoot, output_dir, 'video');
    const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];
    const scenePlans = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /scene_plan.*\.json$/i.test(f)) : [];

    const prompt = `You are the YouTube Platform Agent — a specialist in YouTube content optimization and SEO.

Task: Create YouTube-ready metadata for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, video_narration script, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, approved CTAs
- ${project_dir}/knowledge/platform_guidelines.md — YouTube-specific rules
- ${output_dir}/research_results.json — trending keywords, audience interests, competitor gaps

VIDEO ASSETS PRODUCED:
- Videos: ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}
- Scene plans: ${scenePlans.length > 0 ? scenePlans.join(', ') : 'none'}
- Read scene plans to understand the video content and write accurate descriptions

YOUR JOB:
Transform the campaign narrative into YouTube-optimized metadata. Titles rank in search, descriptions convert viewers, tags improve discovery. Your metadata must accurately describe the VIDEO CONTENT.

OUTPUT — save to ${output_dir}/platforms/youtube.json:
{
  "videos": [
    {
      "file": "video filename",
      "title": "60-70 chars, keyword-rich, no emojis, curiosity-driven",
      "description": "first 2 lines = hook + CTA (visible before fold). Then: 2-3 benefit sentences. Links. Hashtags at bottom.",
      "tags": ["8-12 keyword tags for SEO"],
      "category": "YouTube category",
      "thumbnail_text": "2-4 words for thumbnail overlay",
      "end_screen": "subscribe CTA + related video suggestion"
    }
  ],
  "shorts": {
    "video": "short video filename if available",
    "title": "shorter title for Shorts format",
    "description": "brief + hashtags",
    "tags": ["shorts-specific tags"]
  },
  "scheduling": {
    "best_days": ["from research_results.json"],
    "best_times": ["from research_results.json"],
    "posting_order": "long-form first, then Shorts 24h later"
  },
  "rework_needed": null
}

REWORK: If any video is unsuitable for YouTube (wrong duration, missing audio, poor quality), set "rework_needed" to a description of what needs to change. Otherwise leave null.

Also save ${output_dir}/platforms/youtube.md — human-readable version for review.

QUALITY RULES:
- Title: 60-70 chars, front-load keywords, no clickbait that doesn't deliver
- Description: first 160 chars appear in search — make them count
- Tags: mix of broad + specific, brand name included
- Use trending keywords from research_results.json
- Match brand voice — informative but not corporate`;

    await runClaude(prompt, 'platform_youtube', output_dir, 600000);
    return { status: 'complete', output: `${output_dir}/platforms/youtube.json` };
  }

  async function handlePlatformThreads(job) {
    const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
    const absPlatformDir = path.resolve(projectRoot, output_dir, 'platforms');
    fs.mkdirSync(absPlatformDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const adsDir = path.resolve(projectRoot, output_dir, 'ads');
    const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];

    const prompt = `You are the Threads Platform Agent — a specialist in Threads/Twitter-style short-form content.

Task: Create Threads-ready posts for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, key_phrases, emotional_arc, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, guardrails
- ${project_dir}/knowledge/brand_identity.md — brand voice, tone, what to avoid
- ${project_dir}/knowledge/platform_guidelines.md — Threads-specific rules
- ${output_dir}/research_results.json — trending topics, audience language

VISUAL ASSETS AVAILABLE (for image attachments):
- Images in ${output_dir}/ads/: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}
- Decide which posts benefit from an image attachment and which work better as text-only

YOUR JOB:
Transform the campaign narrative into Threads-native content. Threads is conversational, direct, and punchy — like talking to a friend who happens to be an expert. NOT a copy of the Instagram caption.

OUTPUT — save to ${output_dir}/platforms/threads.json:
{
  "posts": [
    {
      "type": "main",
      "text": "main post — max 500 chars, hook + value + soft CTA",
      "image": "filename from ads/ or null"
    },
    {
      "type": "thread",
      "text": "follow-up in thread — adds context, insight, or behind-the-scenes",
      "image": null
    },
    {
      "type": "standalone",
      "text": "separate post for another day — different angle from the narrative",
      "image": "filename or null"
    }
  ],
  "scheduling": {
    "best_days": ["from research_results.json"],
    "best_times": ["from research_results.json"],
    "posting_order": "main + thread same day, standalone next day"
  },
  "rework_needed": null
}

Also save ${output_dir}/platforms/threads.md — human-readable version for review.

QUALITY RULES:
- Max 500 chars per post
- No more than 3 hashtags per post
- Conversational tone — NOT a copy of Instagram caption
- Main post must hook in first sentence
- Thread follow-ups add NEW value, not just repeat
- Match brand voice exactly`;

    await runClaude(prompt, 'platform_threads', output_dir, 600000);
    return { status: 'complete', output: `${output_dir}/platforms/threads.json` };
  }

  async function handlePlatformTikTok(job) {
    const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
    const absPlatformDir = path.resolve(projectRoot, output_dir, 'platforms');
    fs.mkdirSync(absPlatformDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const videoDir = path.resolve(projectRoot, output_dir, 'video');
    const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];

    const prompt = `You are the TikTok Platform Agent — a specialist in TikTok viral content.

Task: Create TikTok-ready content plan for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, emotional_arc, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, tone
- ${project_dir}/knowledge/platform_guidelines.md — TikTok-specific rules
- ${output_dir}/research_results.json — trending topics, viral hooks, audience behavior

VIDEOS AVAILABLE:
- ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}

TikTok requires 9:16 vertical video (1080x1920). If existing videos are in a different format, set rework_needed with the format request.

YOUR JOB:
Create TikTok-native content. TikTok demands: hook in FIRST 2 SECONDS, fast pacing, trending sounds, authentic (not polished corporate). The content must feel native to the platform.

OUTPUT — save to ${output_dir}/platforms/tiktok.json:
{
  "videos": [
    {
      "source_video": "existing video filename or null",
      "format": "9:16",
      "duration": "15-60s",
      "caption": "short caption — max 150 chars for visibility, punchy, conversational",
      "hashtags": ["mix of trending + niche, max 5"],
      "sound": "trending sound suggestion or 'original audio'",
      "hook_strategy": "what happens in the first 2 seconds to stop the scroll",
      "text_overlays": ["key text that appears on screen during video"]
    }
  ],
  "rework_needed": null,
  "video_format_request": null,
  "scheduling": {
    "best_days": ["from research"],
    "best_times": ["from research"],
    "frequency": "posting cadence recommendation"
  }
}

REWORK: If no 9:16 video exists, set:
  "rework_needed": "Need 9:16 vertical video (1080x1920) for TikTok"
  "video_format_request": { "format": "9:16", "duration": "15-30s", "style": "quick cuts, hook first 2s" }

Also save ${output_dir}/platforms/tiktok.md — human-readable version.

QUALITY RULES:
- Hook in FIRST 2 seconds — no slow intros
- Caption: max 150 chars visible (rest truncated)
- Hashtags: max 5, mix trending + brand
- Tone: authentic, not corporate — TikTok users scroll past polished ads
- Match brand voice but adapt to TikTok culture`;

    await runClaude(prompt, 'platform_tiktok', output_dir, 600000);
    return { status: 'complete', output: `${output_dir}/platforms/tiktok.json` };
  }

  async function handlePlatformFacebook(job) {
    const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
    const absPlatformDir = path.resolve(projectRoot, output_dir, 'platforms');
    fs.mkdirSync(absPlatformDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const adsDir = path.resolve(projectRoot, output_dir, 'ads');
    const videoDir = path.resolve(projectRoot, output_dir, 'video');
    const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];
    const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];

    const prompt = `You are the Facebook Platform Agent — a specialist in Facebook content strategy across Feed, Stories, and Reels.

Task: Create Facebook-ready content plan for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, headlines, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, tone, CTAs
- ${project_dir}/knowledge/platform_guidelines.md — Facebook-specific rules
- ${output_dir}/research_results.json — audience demographics, engagement patterns

VISUAL ASSETS:
- Images: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}
- Videos: ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}

Facebook content types:
- Feed post (image or video): 16:9 landscape or 1:1 square, longer captions OK
- Stories: 9:16 vertical, 15s segments, ephemeral
- Reels: 9:16 vertical, 15-90s, algorithm-boosted
- Video: 16:9 landscape preferred, up to 240 min

YOUR JOB:
Create Facebook-native content. Facebook favors: longer engagement, shares/comments, community building, video (especially Reels). Adapt the narrative for an audience that skews older and more community-oriented than Instagram.

OUTPUT — save to ${output_dir}/platforms/facebook.json:
{
  "feed_post": {
    "type": "image or video",
    "media": "filename from ads/ or video/",
    "format": "1:1 or 16:9",
    "caption": "longer caption OK — hook + story + CTA + hashtags (3-5)",
    "link": "URL if applicable"
  },
  "stories": {
    "sequence": [
      { "slide": 1, "media": "filename", "text_overlay": "bold text", "cta": "swipe action" }
    ]
  },
  "reels": {
    "source_video": "existing video or null",
    "format": "9:16",
    "caption": "short engaging caption",
    "hashtags": ["relevant hashtags"]
  },
  "video": {
    "source_video": "existing 16:9 video or null",
    "title": "video title for Facebook",
    "description": "video description"
  },
  "rework_needed": null,
  "video_format_request": null,
  "scheduling": {
    "best_days": ["from research"],
    "best_times": ["from research"],
    "posting_order": "feed post, then stories, then reels"
  }
}

REWORK: If you need a 16:9 video and only 9:16 exists (or vice versa), set:
  "rework_needed": "description of what's needed"
  "video_format_request": { "format": "16:9", "duration": "30-60s", "style": "description" }

Also save ${output_dir}/platforms/facebook.md — human-readable version.

QUALITY RULES:
- Feed captions can be longer (up to 500 words) — use storytelling
- Reels need hook in first 3 seconds
- Stories: bold text, 1 message per slide
- Community tone — encourage comments and shares
- Match brand voice`;

    await runClaude(prompt, 'platform_facebook', output_dir, 600000);
    return { status: 'complete', output: `${output_dir}/platforms/facebook.json` };
  }

  async function handlePlatformLinkedIn(job) {
    const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
    const absPlatformDir = path.resolve(projectRoot, output_dir, 'platforms');
    fs.mkdirSync(absPlatformDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const adsDir = path.resolve(projectRoot, output_dir, 'ads');
    const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];

    const prompt = `You are the LinkedIn Platform Agent — a specialist in LinkedIn professional content.

Task: Create LinkedIn-ready content for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, professional tone
- ${project_dir}/knowledge/platform_guidelines.md — LinkedIn-specific rules
- ${output_dir}/research_results.json — industry trends, professional audience insights

VISUAL ASSETS:
- Images: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}

LinkedIn content types:
- Post (text + image): 1200x627 landscape or 1080x1080 square
- Article: long-form thought leadership
- Document/carousel: PDF slides (swipeable)

YOUR JOB:
Adapt the campaign narrative for a PROFESSIONAL audience. LinkedIn rewards: thought leadership, data-driven insights, professional storytelling, industry relevance. NOT a copy of Instagram — reframe the message for business context.

OUTPUT — save to ${output_dir}/platforms/linkedin.json:
{
  "post": {
    "text": "professional post — hook first line (before ...see more) + insight + value + CTA. Max 3000 chars but front-load value in first 300.",
    "image": "filename from ads/ or null",
    "format": "1200x627 or 1080x1080",
    "hashtags": ["3-5 professional hashtags"]
  },
  "article": {
    "title": "thought leadership title if applicable",
    "summary": "2-3 sentences — only if the campaign angle merits long-form",
    "publish": false
  },
  "carousel_document": {
    "slides": ["slide 1 text", "slide 2 text"],
    "description": "PDF carousel concept — if applicable",
    "publish": false
  },
  "rework_needed": null,
  "scheduling": {
    "best_days": ["Tue, Wed, Thu — highest LinkedIn engagement"],
    "best_times": ["8-10 AM or 12-1 PM"],
    "posting_notes": "post once, engage in comments for 2 hours after"
  }
}

Also save ${output_dir}/platforms/linkedin.md — human-readable version.

QUALITY RULES:
- Professional tone — not corporate jargon, but not casual/slang either
- Hook in FIRST LINE (before "...see more" fold)
- Add value/insight — LinkedIn penalizes pure self-promotion
- Hashtags: 3-5 professional/industry hashtags
- If campaign angle doesn't fit LinkedIn (e.g. pure lifestyle), acknowledge it and suggest a professional reframe
- Match brand voice adapted for professional context`;

    await runClaude(prompt, 'platform_linkedin', output_dir, 600000);
    return { status: 'complete', output: `${output_dir}/platforms/linkedin.json` };
  }

  return {
    handleDistributionAgent,
    handlePlatformInstagram,
    handlePlatformYouTube,
    handlePlatformThreads,
    handlePlatformTikTok,
    handlePlatformFacebook,
    handlePlatformLinkedIn,
  };
}

module.exports = { createPlatformHandlers };

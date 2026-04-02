const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { captureScreenshots, extractUrlsFromFiles } = require('./capture-screenshots');

function createAdCreativeHandler({
  projectRoot,
  imageProviderName,
  defaultModel,
  buildImagePrompt,
  log,
  runClaude,
  waitForFile,
  resolveImageSource,
  getFreeImageProvider,
  getFolderAssets,
  getImageDimensions,
  getProjectAssets,
  formatAssetList,
  getImageProvider,
  readBrandContext,
}) {
  async function generateApiImages(outputDir, projectDir, model = defaultModel, count = 5, formats = ['carousel_1080x1080'], brief = '', useBrandOverlay = true, scenePurposes = [], sceneDescriptions = [], provider = imageProviderName) {
    const imageProvider = getImageProvider(provider);
    const genImage = imageProvider.generateImage;
    const absImgsDir = path.resolve(projectRoot, outputDir, 'imgs');
    fs.mkdirSync(absImgsDir, { recursive: true });

    const formatToRatio = {
      carousel_1080x1080: '1:1',
      story_1080x1920: '9:16',
      reels_1080x1920: '9:16',
      youtube_thumbnail: '16:9',
    };

    const brand = useBrandOverlay ? readBrandContext(projectDir) : null;
    if (brand) {
      log(outputDir, 'api_image_gen', `Brand context loaded: ${brand.brandName} | colors: ${brand.colors.join(', ')}`);
    }

    const defaultSceneOrder = ['hook', 'tension', 'solution', 'social_proof', 'cta'];
    const assets = [];
    let imgIndex = 1;
    const formatList = [];
    for (let i = 0; i < count; i++) formatList.push(formats[i % formats.length]);

    const allPrompts = [];
    for (let pi = 0; pi < formatList.length; pi++) {
      const fmt = formatList[pi];
      const ratio = formatToRatio[fmt] || '1:1';
      const taskPrefix = path.basename(outputDir);
      const filename = `${taskPrefix}_generated_${String(pi + 1).padStart(2, '0')}_${fmt}.jpg`;
      const sceneType = scenePurposes[pi] || defaultSceneOrder[pi % defaultSceneOrder.length];
      const sceneDesc = sceneDescriptions[pi] || '';
      const prompt = buildImagePrompt(brief, brand, fmt, pi + 1, count, sceneType, sceneDesc, model);
      allPrompts.push({ index: pi + 1, filename, format: fmt, ratio, sceneType, prompt });
      const promptTxtPath = path.join(absImgsDir, filename.replace(/\.[^.]+$/, '_prompt.txt'));
      fs.writeFileSync(promptTxtPath, prompt);
    }
    log(outputDir, 'api_image_gen', `All ${allPrompts.length} prompts saved as _prompt.txt files`);

    for (const fmt of formatList) {
      const ratio = formatToRatio[fmt] || '1:1';
      const taskPrefix = path.basename(outputDir);
      const filename = `${taskPrefix}_generated_${String(imgIndex).padStart(2, '0')}_${fmt}.jpg`;
      const outputPath = path.join(absImgsDir, filename);
      const sceneType = scenePurposes[imgIndex - 1] || defaultSceneOrder[(imgIndex - 1) % defaultSceneOrder.length];

      if (fs.existsSync(outputPath)) {
        log(outputDir, 'api_image_gen', `Already exists, skipping: ${filename}`);
      } else {
        const prompt = allPrompts[imgIndex - 1].prompt;
        log(outputDir, 'api_image_gen', `Generating ${imgIndex}/${count}: ${filename} [${sceneType}] (${provider}/${model}, ${ratio})`);
        log(outputDir, 'api_image_gen', `Prompt: ${prompt.slice(0, 200)}`);

        try {
          await genImage(outputPath, prompt, model, ratio);
          process.stdout.write(`[STAGE2_IMAGE_READY] ${outputDir} ${outputPath}\n`);
        } catch (err) {
          log(outputDir, 'api_image_gen', `Failed image ${imgIndex}: ${err.message}`);
          imgIndex++;
          continue;
        }
      }

      const dims = getImageDimensions(outputPath);
      assets.push({ path: outputPath, sceneType, ...dims });
      imgIndex++;
    }

    if (assets.length === 0) {
      const lastError = (() => {
        try {
          const logPath = path.resolve(projectRoot, outputDir, 'logs', 'api_image_gen.log');
          const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
          const failLine = [...lines].reverse().find(l => l.includes('Failed image'));
          return failLine ? failLine.replace(/.*Failed image \d+: /, '') : 'Todas as imagens falharam';
        } catch {
          return 'Todas as imagens falharam';
        }
      })();

      process.stdout.write(`[IMAGE_GEN_ERROR] ${outputDir} ${lastError}\n`);
      log(outputDir, 'api_image_gen', '[IMAGE_GEN_ERROR] emitted — waiting for user decision...');

      const decisionPath = path.resolve(projectRoot, outputDir, 'imgs', 'error_decision.json');
      const decided = await waitForFile(decisionPath, 600000);
      if (!decided) throw new Error('Timeout aguardando decisão do usuário sobre erro de imagens');

      const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf-8'));
      fs.unlinkSync(decisionPath);

      if (decision.action === 'cancel') throw new Error('Geração de imagens cancelada pelo usuário');
      if (decision.action === 'retry') {
        log(outputDir, 'api_image_gen', 'Retrying image generation by user request...');
        return generateApiImages(outputDir, projectDir, model, count, formats, brief, useBrandOverlay, scenePurposes);
      }
      if (decision.action === 'change_source') {
        log(outputDir, 'api_image_gen', `Changing image source to: ${decision.image_source}`);
        const overridePath = path.resolve(projectRoot, outputDir, 'imgs', 'source_override.json');
        fs.writeFileSync(overridePath, JSON.stringify({ image_source: decision.image_source, image_folder: decision.image_folder || null }));
        return [];
      }
      log(outputDir, 'api_image_gen', 'Advancing without images by user request.');
    }

    return assets;
  }

  return async function handleAdCreativeDesigner(job) {
    const {
      task_name, task_date, output_dir, project_dir, platform_targets,
      language, campaign_brief,
      image_count = 1, image_formats = ['carousel_1080x1080'],
      image_source: rawImageSource = 'brand',
      image_folder = null,
    } = job.data;
    const { source: image_source, folder: imageFolder } = resolveImageSource(rawImageSource, image_folder);
    const absAdsDir = path.resolve(projectRoot, output_dir, 'ads');
    fs.mkdirSync(absAdsDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: All text in the ads (headlines, subtext, CTAs) MUST be written in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const hasStories = image_formats.includes('story_1080x1920');
    const hasCarousel = image_formats.includes('carousel_1080x1080');
    const fnPrefix = task_name;

    let imageInstructions = '';
    if (hasCarousel && hasStories) {
      const carouselCount = Math.ceil(image_count * 0.6);
      const storyCount = image_count - carouselCount;
      imageInstructions = `
Generate ${image_count} total ad images:
- ${carouselCount} CAROUSEL slides (1080x1080) — saved as ${fnPrefix}_carousel_01.png, ${fnPrefix}_carousel_02.png, etc.
- ${storyCount} STORIES images (1080x1920) — saved as ${fnPrefix}_story_01.png, ${fnPrefix}_story_02.png, etc.

For EACH image:
1. Create a separate HTML file (${fnPrefix}_carousel_01.html, ${fnPrefix}_story_01.html, etc.) with inline CSS
2. Use Playwright to screenshot it at the correct resolution (1080x1080 for carousel, 1080x1920 for stories)

CRITICAL: ALL filenames MUST start with "${fnPrefix}_" prefix.

Each slide/story must have a DIFFERENT visual concept and copy. The carousel should tell a progression:
- Slide 1: Hook (attention grabber)
- Slides 2-${carouselCount - 1}: Benefits, emotional moments, product features
- Slide ${carouselCount}: CTA

Stories should be vertical, bold, quick-read — one key message per story with large text.`;
    } else if (hasCarousel) {
      imageInstructions = `
Generate ${image_count} carousel slides (1080x1080) — saved as ${fnPrefix}_carousel_01.png through ${fnPrefix}_carousel_0${image_count}.png.
For EACH slide, create a separate HTML file and render via Playwright at 1080x1080.
CRITICAL: ALL filenames MUST start with "${fnPrefix}_" prefix.
Each slide must have different visual concept and copy, forming a narrative progression.`;
    } else {
      imageInstructions = `
Generate ${image_count} story images (1080x1920) — saved as ${fnPrefix}_story_01.png through ${fnPrefix}_story_0${image_count}.png.
For EACH story, create a separate HTML file and render via Playwright at 1080x1920.
CRITICAL: ALL filenames MUST start with "${fnPrefix}_" prefix.
Each story has one bold key message with large text.`;
    }

    const providerName = job.data.image_provider || imageProviderName;
    let apiGeneratedAssets = [];
    if (image_source === 'api') {
      const model = job.data.image_model || process.env.KIE_DEFAULT_MODEL || defaultModel;
      const useBrand = job.data.use_brand_overlay !== false;

      let scenePurposes = [];
      let sceneDescriptions = [];
      const briefPath = path.resolve(projectRoot, output_dir, 'creative', 'creative_brief.json');
      if (fs.existsSync(briefPath)) {
        try {
          const brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
          if (brief.carousel_structure) {
            const slideKeys = Object.keys(brief.carousel_structure)
              .filter(k => k.startsWith('slide_'))
              .sort();
            sceneDescriptions = slideKeys.map(k => brief.carousel_structure[k].conceito_visual || '');
            scenePurposes = slideKeys.map(k => {
              const tema = (brief.carousel_structure[k].tema || '').toLowerCase();
              if (tema.includes('hook')) return 'hook';
              if (tema.includes('cta')) return 'cta';
              return 'solution';
            });
          }
          if (sceneDescriptions.filter(Boolean).length === 0) {
            const metaphor = brief.visual_direction?.key_visual_metaphor || '';
            const mood = brief.visual_direction?.mood || '';
            const slideTemplates = [
              { purpose: 'hook', desc: `${metaphor || 'leader commanding technology'}. low angle dramatic shot, strong silhouette, dark futuristic background, blue accent lighting, cinematic wide` },
              { purpose: 'solution', desc: 'close-up hands on tablet with AI workflow on screen, warm side lighting, shallow depth of field, modern office, professional atmosphere' },
              { purpose: 'solution', desc: `diverse team collaborating around holographic display, aerial view, ${mood || 'premium dark'} environment, multiple screens, dynamic composition` },
              { purpose: 'social_proof', desc: 'community gathering in modern auditorium, faces lit by screens, warm golden hour light, sense of belonging, wide shot with depth' },
              { purpose: 'cta', desc: 'clean minimalist composition, brand logo space, premium dark background with subtle gradient, inviting atmosphere, centered framing' },
            ];

            sceneDescriptions = [];
            scenePurposes = [];
            for (let si = 0; si < image_count; si++) {
              const tmpl = slideTemplates[si % slideTemplates.length];
              sceneDescriptions.push(tmpl.desc.slice(0, 250));
              scenePurposes.push(tmpl.purpose);
            }
            log(output_dir, 'ad_creative_designer', `Fallback: generated ${sceneDescriptions.length} varied English descriptions`);
          }
          log(output_dir, 'ad_creative_designer', `Creative brief loaded: ${sceneDescriptions.length} visual descriptions`);
        } catch (e) {
          log(output_dir, 'ad_creative_designer', `Could not parse creative_brief.json: ${e.message}`);
        }
      }

      log(output_dir, 'ad_creative_designer', `Generating ${image_count} images via ${providerName} (${model}, brand=${useBrand})...`);
      try {
        apiGeneratedAssets = await generateApiImages(
          output_dir, project_dir, model, image_count, image_formats, campaign_brief, useBrand,
          scenePurposes, sceneDescriptions, providerName
        );
        log(output_dir, 'ad_creative_designer', `Generated ${apiGeneratedAssets.length} images → ${output_dir}/imgs/`);
      } catch (err) {
        log(output_dir, 'ad_creative_designer', `API image generation failed: ${err.message}. Falling back to CSS-only layouts.`);
      }

      if (apiGeneratedAssets.length > 0) {
        const approvalPath = path.resolve(projectRoot, output_dir, 'imgs', 'approved.json');
        const rejectedPath = path.resolve(projectRoot, output_dir, 'imgs', 'rejected.json');
        process.stdout.write(`[IMAGE_APPROVAL_NEEDED] ${output_dir}\n`);
        log(output_dir, 'ad_creative_designer', '[IMAGE_APPROVAL_NEEDED] Waiting for user to approve generated images...');
        fs.writeFileSync(path.resolve(projectRoot, output_dir, 'imgs', 'approval_needed.json'),
          JSON.stringify({ type: 'images', output_dir, ts: Date.now() }));

        const imgApproved = await waitForFile(approvalPath, 1800000);
        if (!imgApproved) {
          if (fs.existsSync(rejectedPath)) {
            log(output_dir, 'ad_creative_designer', 'User rejected generated images. Stopping.');
            return { status: 'skipped', reason: 'images rejected' };
          }
          log(output_dir, 'ad_creative_designer', 'Image approval timeout. Proceeding anyway.');
        } else {
          log(output_dir, 'ad_creative_designer', 'Images approved. Proceeding to creative assembly.');
        }
      }
    }

    let imageSourceSection = '';
    if (image_source === 'api') {
      if (apiGeneratedAssets.length > 0) {
        const generatedList = formatAssetList(apiGeneratedAssets);
        imageSourceSection = `
STEP 2 — AI-generated images (generated via ${providerName} API — use these):
${generatedList}

These images were generated specifically for this campaign. Use them as <img src="file://<absolute_path>"> in your HTML.
Apply overlays, gradients, and text — the same way as brand images.`;
      } else {
        imageSourceSection = `
STEP 2 — Image source: CSS-only (API generation failed or unavailable)
- Use CSS gradients, bold typography, and geometric shapes
- No <img> tags — pure HTML/CSS visual design`;
      }
    } else if (image_source === 'free') {
      const freeProvider = getFreeImageProvider();
      if (freeProvider) {
        const authNote = freeProvider.authHeader
          ? `Header: ${freeProvider.authHeader}: ${freeProvider.key}`
          : `Parameter: key=${freeProvider.key}`;
        imageSourceSection = `
STEP 2 — Image source: ${freeProvider.name.toUpperCase()} (free stock photos)
- Search: GET ${freeProvider.searchUrl}?query=<theme>&per_page=5
  ${authNote}
- Download the best photos to ${output_dir}/imgs/ and use as <img src="file://...">
- Choose photos that match the campaign emotional theme
- If a photo has visible text or watermarks, set image_type: "banner" (no cropping)`;
      } else {
        imageSourceSection = `
STEP 2 — Image source: CSS-only (no free image provider configured — set PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, or PIXABAY_API_KEY in .env)
- Use CSS gradients, bold typography, and geometric shapes
- No <img> tags — pure HTML/CSS visual design`;
      }
    } else if (image_source === 'folder') {
      const folderAssets = imageFolder ? getFolderAssets(imageFolder) : [];
      const folderList = formatAssetList(folderAssets);
      if (folderAssets.length > 0) {
        imageSourceSection = `
STEP 2 — Images from user-specified folder (MANDATORY — use these):
${folderList}

CRITICAL IMAGE RULES:
- Embed these images as <img src="file://<absolute_path>"> in your HTML
- Choose the most contextually relevant image for each slide (different image per slide)
- Apply CSS: semi-transparent overlays, gradients, blur effects ON TOP of real images
- Text must be readable — use text-shadow, backdrop-filter blur, or dark overlay bands
- BANNER images (marked [banner]): use object-fit: contain, never cover
- VIDEO CLIPS (marked [clip]): reference in layout.json, do NOT embed in HTML`;
      } else {
        imageSourceSection = `
STEP 2 — Image source: folder "${imageFolder || '(not specified)'}" — no images found
- Falling back to CSS-only: gradients, bold typography, and geometric shapes
- No <img> tags — pure HTML/CSS visual design`;
      }
    } else if (image_source === 'screenshot') {
      const briefPath = path.resolve(projectRoot, output_dir, 'creative', 'creative_brief.json');
      const researchPath = path.resolve(projectRoot, output_dir, 'research_results.json');
      const productPath = path.resolve(projectRoot, project_dir, 'knowledge', 'product_campaign.md');
      const extractedUrls = extractUrlsFromFiles([briefPath, researchPath, productPath]);
      const explicitUrls = job.data.screenshot_urls || [];
      const allUrls = [...new Set([...explicitUrls, ...extractedUrls])];
      log(output_dir, 'ad_creative_designer', `Capturing screenshots from ${allUrls.length} URLs...`);
      const screenshotAssets = await captureScreenshots(allUrls, path.resolve(projectRoot, output_dir));
      const brandAssets = getProjectAssets(project_dir);
      const combinedAssets = [...screenshotAssets, ...brandAssets];
      const assetList = formatAssetList(combinedAssets);
      imageSourceSection = `
STEP 2 — Screenshots + brand images (${screenshotAssets.length} screenshots + ${brandAssets.length} brand):
${assetList}

CRITICAL IMAGE RULES:
- Embed as <img src="file://<absolute_path>"> in your HTML
- Screenshots show the real product interface — prioritize them
- Combine with brand photos for variety
- Apply CSS overlays, gradients, blur for text readability
- BANNER images (marked [banner]): use object-fit: contain, never cover`;
    } else {
      const brandAssets = getProjectAssets(project_dir);
      const assetList = formatAssetList(brandAssets);
      imageSourceSection = `
STEP 2 — Available brand images (MANDATORY — use these real images):
${assetList}

CRITICAL IMAGE RULES:
- You MUST embed these brand images as <img src="file://<absolute_path>"> in your HTML
- Do NOT use solid colored boxes as backgrounds — use the real brand photos
- Choose the most contextually relevant image for each slide (different image per slide)
- Apply CSS: semi-transparent overlays, gradients, blur effects ON TOP of real images
- Text must be readable — use text-shadow, backdrop-filter blur, or dark overlay bands
- BANNER images (marked [banner] in the list): use object-fit: contain, never object-fit: cover — the full image must be visible, no cropping
- VIDEO CLIPS (marked [clip] in the list): reference the clip path in layout.json but do NOT embed in HTML — note it for the Distribution Agent`;
    }

    const prompt = `You are the Ad Creative Designer. Your role is PURELY VISUAL — you design and render ad images. You do NOT write copy.

Follow the skill defined in skills/ad-creative-designer/SKILL.md for brand guidelines, but adapt the output format as instructed below.

Task: Create multiple static ad creatives for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
${langInstruction}${briefInstruction}

STEP 1 — Read ALL inputs FIRST (before designing anything):
- ${output_dir}/creative/creative_brief.json — campaign angle, emotional hook, visual direction (mood, colors, photography style, typography mood), approved CTAs
- ${output_dir}/copy/narrative.json — MANDATORY: the campaign narrative with headlines, carousel_texts, story_texts, key_phrases, and approved CTAs. This is your text source.
- ${project_dir}/knowledge/brand_identity.md — color palette, typography, tone
- ${project_dir}/knowledge/product_campaign.md — product features, assets described
- ${project_dir}/knowledge/platform_guidelines.md — format requirements per platform
- skills/typography-on-image/SKILL.md — CRITICAL: text positioning, font sizing, contrast rules, and legibility over images

COPY RULE: You MUST use the text from narrative.json. Do NOT invent headlines, subtext, or CTAs.
- For carousel slides: read narrative.json → carousel_texts (one entry per slide)
- For stories: read narrative.json → story_texts (one entry per story)
- Headlines: read narrative.json → headlines
- CTAs: use ONLY narrative.json → approved_ctas
- If narrative.json is missing, fall back to creative_brief.json → key_messages
${imageSourceSection}

STEP 3 — Design and render ads:
${imageInstructions}

STEP 4 — Save ALL files to ${output_dir}/ads/:
- layout.json (metadata: filename, dimensions, concept, copy_source, images_used array)
- All HTML source files
- All PNG renders (via Playwright)

CRITICAL RENDER: Use Playwright (chromium) to render EVERY HTML to PNG:
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1080 }); // 1920 for stories
  await page.goto('file://' + path.resolve(htmlFilePath));
  await page.waitForTimeout(600); // let CSS animations settle
  await page.screenshot({ path: pngOutputPath });
  await browser.close();

━━━ VISUAL DESIGN STANDARDS (mandatory — this is the quality bar) ━━━

COMPOSITION & LAYOUT:
- Use the "Z-pattern" or "F-pattern" reading flow — place the most important element top-left or centered
- Breathing room: minimum 48px margin on all sides — never crowd the edges
- Visual weight: one dominant element per slide (headline OR image OR graphic) — not all at once
- Use the rule of thirds: position subject at intersection points, not dead center
- For carousels: each slide has ONE primary message — no information overload

TYPOGRAPHY (critical):
- Maximum 2 font sizes per slide: one for headline (80-120px), one for subtext (36-52px)
- Headlines: ALL CAPS or Title Case, never sentence case for impact
- Line height: 1.1-1.2 for headlines, 1.4-1.6 for body text
- Letter spacing: +0.02em to +0.08em for headlines — gives premium feel
- Hierarchy rule: headline > subtext > CTA — each 30-40% smaller than the previous
- NEVER use more than 8 words on a headline — if longer, split into headline + subtext

COLOR & CONTRAST:
- Text on image: ALWAYS use at least one of: dark scrim (rgba 0,0,0,0.5+), blur backdrop, gradient overlay, or solid color band
- Contrast ratio minimum: 4.5:1 for body text, 3:1 for large headlines (WCAG AA)
- Use brand accent color SPARINGLY — 1-2 elements max (CTA button, underline, badge)
- Gradient overlays: prefer bottom-to-top (text lives at bottom) or full-bleed subtle vignette

VISUAL EFFECTS (use inline CSS):
- Image treatment: mix of brightness(0.85) + contrast(1.1) + saturate(1.2) for punchy look
- Glassmorphism CTA button: background: rgba(255,255,255,0.15); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.3)
- Text pop: text-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.3)
- Subtle glow on CTA: box-shadow: 0 4px 24px rgba(<accent-color>, 0.5)
- Overlay gradient: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)

CSS ANIMATION (capture the "first-frame" of the animation for the screenshot):
- Headline: animate fade-up — transform: translateY(20px) > 0; opacity: 0 > 1
- CTA badge: animate scale-in — transform: scale(0.9) > 1; opacity: 0 > 1; delay 0.3s
- Set animation-fill-mode: both and animation-duration: 0.5s — Playwright captures at ~600ms, so they'll be fully visible

SLIDE-SPECIFIC DESIGN (for carousels):
- Slide 1 (Hook): Maximum visual impact. Bold treatment of the hook caption.
- Middle slides: One benefit per slide. Human/emotional imagery if possible.
- Last slide (CTA): Brand logo visible, CTA button prominent, URL/handle clear.

CTA BUTTON DESIGN:
- Pill shape: border-radius: 9999px
- Padding: 18px 48px
- Font: uppercase, letter-spacing: 0.1em, bold
- High contrast: brand accent fill or white fill with dark text
- Never just text — always a visible button container

Design quality bar:
- Each slide uses a DIFFERENT brand image — never repeat the same photo
- Brand color palette from brand_identity.md applied consistently
- Every slide looks like it belongs to the same campaign (visual cohesion)
- Campaign theme + emotional feeling present in every single image

MULTI-PIECE DIVERSITY (CRITICAL — when generating multiple carousels or stories):
- Each carousel set MUST have a distinct visual theme, color treatment, and hero image
- No two carousels may use the same primary image or the same headline
- Carousel 1 = hook/emotional angle, Carousel 2 = benefit/proof angle, Carousel 3 = social proof/CTA angle
- Stories must each convey a different message — never duplicate a carousel's content
- If 2+ carousels exist, verify NO image filename appears in more than one carousel`;

    await runClaude(prompt, 'ad_creative_designer', output_dir, 900000);

    if (fs.existsSync(absAdsDir)) {
      const pngFiles = fs.readdirSync(absAdsDir).filter(f => f.endsWith('.png'));
      for (const f of pngFiles) {
        const dims = getImageDimensions(path.join(absAdsDir, f));
        if (!dims) continue;
        const ratio = parseFloat(dims.ratio);
        const isCarousel = f.includes('carousel');
        const isStory = f.includes('story') || f.includes('reel');

        if (isCarousel && (ratio < 0.85 || ratio > 1.15)) {
          log(output_dir, 'ad_creative_designer', `WARN: ${f} is ${dims.width}x${dims.height} (ratio ${dims.ratio}) — expected 1:1 for carousel. Cropping...`);
          const fullPath = path.join(absAdsDir, f);
          const tmpPath = fullPath + '.tmp.png';
          try {
            execFileSync('ffmpeg', ['-y', '-i', fullPath, '-vf', 'crop=min(iw\\,ih):min(iw\\,ih)', tmpPath],
              { stdio: 'pipe', timeout: 15000 });
            fs.renameSync(tmpPath, fullPath);
            log(output_dir, 'ad_creative_designer', `Cropped ${f} to 1:1`);
          } catch (e) {
            log(output_dir, 'ad_creative_designer', `Failed to crop ${f}: ${e.message.slice(0, 100)}`);
            try { fs.unlinkSync(tmpPath); } catch {}
          }
        }

        if (isStory && (ratio > 0.65 || ratio < 0.45)) {
          log(output_dir, 'ad_creative_designer', `WARN: ${f} is ${dims.width}x${dims.height} (ratio ${dims.ratio}) — expected 9:16 for story`);
        }
      }
    }

    return { status: 'complete', output: `${output_dir}/ads/` };
  };
}

module.exports = { createAdCreativeHandler };

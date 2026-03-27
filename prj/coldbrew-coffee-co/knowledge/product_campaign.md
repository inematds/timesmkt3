# ***📦 Product & Campaign Knowledge: Cold Brew Coffee Co.***

***Purpose:** This document provides the Video Agent and Image Agent with all product details, selling points, visual asset references, and campaign creative direction needed for ad generation.*

---

## ***1\. Product Overview***

| *Attribute* | *Details* |
| ----- | ----- |
| ***Product Name*** | *Cold Brew Coffee* |
| ***Format*** | *Ready-to-drink* |
| ***Target Audience*** | *Busy professionals, coffee enthusiasts, morning routine seekers* |
| ***Brand Positioning*** | *Premium coffee experience, accessible at home* |

---

## ***2\. Product Features***

*These are the core product truths. All generated content should be grounded in at least one of these.*

| *Feature* | *Description* |
| ----- | ----- |
| ***Smooth taste*** | *No bitter aftertaste — consistently smooth from first sip to last* |
| ***Ready-to-drink*** | *No brewing required; grab-and-go convenience* |
| ***Low acidity*** | *Gentler on the stomach compared to hot-brewed coffee* |

***Writing tip for agents:** Lead with the benefit, not the feature.*

* *✅ "No bitterness. Just smooth, cold perfection."*  
* *❌ "Our product has been formulated to reduce acidic compounds."*

---

## ***3\. Key Selling Points***

*Use these as the emotional and functional hooks in ad copy, voiceovers, and visual storytelling.*

| *Selling Point* | *Angle* |
| ----- | ----- |
| ***Morning energy boost*** | *Replaces sluggish mornings with a clean, confident start* |
| ***Built for busy professionals*** | *Fast, no-fuss, premium — fits into any schedule* |
| ***Premium at-home experience*** | *Café-quality coffee without leaving the house or spending $7* |

***Priority order for campaigns:***

1. *Morning energy & mood uplift*  
2. *Convenience & speed*  
3. *Premium quality / taste*

---

## ***4\. Visual Assets***

*⚠️ **Video Agent note:** All video ads are rendered via **Remotion** (React-based video framework). Scenes must be built entirely from **React components and SVGs** — no raw image footage or live-action video clips. PNG assets below are available via Remotion's `staticFile()` helper or standard `<img>` tags inside compositions, but all motion, scenes, and backgrounds must be code-driven.*

### ***Static Assets (usable in Remotion via `staticFile()`)***

| *Filename* | *Description* | *Best Used For* |
| ----- | ----- | ----- |
| *`coffee_glass.png`* | *Cold brew in a clear glass, ice visible* | *Product close-up scenes, SVG overlay compositions* |
| *`coffee_can.png`* | *Branded can product shot* | *Packaging hero scenes, product reveal animations* |
| *`morning_cafe.png`* | *Warm morning café atmosphere* | *Background layer behind SVG illustrated elements* |

***Asset usage notes:***

* *All animation must be handled via Remotion's `interpolate()` and `useCurrentFrame()` — not external CSS keyframes*  
* *`coffee_glass.png` and `coffee_can.png` are interchangeable for most placements*  
* *`morning_cafe.png` works best as a background layer; always place SVG illustrations on top*  
* *When in doubt, **build the scene in SVG** rather than relying on a PNG — SVG scales cleanly and every element can be individually animated*

---

## ***5\. Video Production Constraints (Remotion)***

*All video ads are generated programmatically using **Remotion**. The Video Agent must work within these hard constraints:*

| *Constraint* | *Rule* |
| ----- | ----- |
| ***Rendering engine*** | *React components \+ SVG only* |
| ***No video footage*** | *No `.mp4`, no live-action clips, no stock video* |
| ***No external CSS animations*** | *All animation via `useCurrentFrame()` \+ `interpolate()`* |
| ***Images*** | *Allowed via `staticFile()` — use sparingly as accent or background layers* |
| ***Typography*** | *Load fonts via `@remotion/google-fonts` or bundle locally* |
| ***Audio*** | *Optional voiceover or music via Remotion's `<Audio>` component* |
| ***Composition sizes*** | *1080×1080 (feed) or 1080×1920 (Story/Reel) — match to platform target* |

---

## ***6\. Motion Style: Kurzgesagt-Inspired (Brand Adapted)***

*All video ads follow a **Kurzgesagt-inspired flat motion design style**, adapted to Cold Brew Coffee Co.'s playful, premium brand. Think clean illustrated worlds, smooth character motion, and satisfying transitions — grounded in coffee, mornings, and energy rather than science explainers.*

### ***Core Style Principles***

| *Element* | *Direction* |
| ----- | ----- |
| ***Illustration style*** | *Flat SVG shapes; bold outlines; minimal gradients (brand colors only)* |
| ***Color palette*** | *Deep coffee browns, cold blue-whites, warm amber accents (see table below)* |
| ***Characters*** | *Simple flat vector humans; expressive but minimal facial features* |
| ***Animation feel*** | *Smooth ease-in-out; objects "pop" in with a slight spring overshoot* |
| ***Transitions*** | *Wipe, slide, or zoom — never hard cuts between scenes* |
| ***Typography motion*** | *Text animates in per-word or per-letter; never appears statically* |
| ***Pacing*** | *Snappy — each scene beat is 1.5–3 seconds; total ad 15–30 seconds* |

### ***Brand Color Palette for Video***

| *Color* | *Hex* | *Use* |
| ----- | ----- | ----- |
| *Coffee Dark* | *`#2C1A0E`* | *Backgrounds, outlines* |
| *Coffee Mid* | *`#4B2E1A`* | *Character fills, product shapes* |
| *Cold Blue* | *`#BFD9E8`* | *Ice, liquid, cool accents* |
| *Amber* | *`#F5A623`* | *Highlights, CTA text, energy accents* |
| *Off-White* | *`#F9F5F0`* | *Text, clean backgrounds* |

---

## ***7\. Video Campaign Concepts***

*Each concept is a **Remotion scene brief** — structured for the Video Agent to translate directly into React components and SVG compositions.*

---

### ***Concept 1 — "Your Morning, Upgraded"***

***Logline:** A flat-illustrated morning transforms the moment Cold Brew appears. **Duration:** 20 seconds | **Format:** 1080×1080*

| *Scene* | *Frames (@ 30fps)* | *Description* |
| ----- | ----- | ----- |
| ***Intro*** | *0–60* | *Dark background; animated alarm clock SVG rings; sun arc rises from bottom of frame* |
| ***The Struggle*** | *60–120* | *Flat illustrated character sits up, eyes half-open; desaturated grey tone across scene* |
| ***The Reveal*** | *120–160* | *Coffee can SVG slides in from right with a spring "pop"; scene color shifts — amber \+ cold blue flood in* |
| ***Energy Beat*** | *160–200* | *Character perks up; sparkle/star SVGs burst outward from can; background fills to warm amber* |
| ***CTA*** | *200–240* | *Off-white background; text animates in per-word: **"Upgrade Your Morning"**; can fades in below* |

* ***Suggested CTA:** `Upgrade Your Morning`*  
* ***Key SVGs needed:** alarm clock, sun arc, flat human figure (2 states: tired / alert), sparkle burst, coffee can silhouette*

---

### ***Concept 2 — "No Time? No Problem."***

***Logline:** Fast-paced illustrated morning — Cold Brew is the one thing that keeps up. **Duration:** 15 seconds | **Format:** 1080×1920 (Story/Reel)*

| *Scene* | *Frames (@ 30fps)* | *Description* |
| ----- | ----- | ----- |
| ***Chaos Intro*** | *0–45* | *SVG icons spin and fly across screen: laptop, phone, calendar, clock* |
| ***Pause Beat*** | *45–75* | *Everything freezes mid-air; flat hand/arm SVG reaches up from bottom holding coffee can* |
| ***Release*** | *75–110* | *Icons drift down and settle; character appears, relaxed, holding can* |
| ***CTA*** | *110–150* | *Bold text animates in word-by-word: **"Grab Yours"** with a downward arrow* |

* ***Suggested CTA:** `Grab Yours`*  
* ***Key SVGs needed:** laptop, phone, calendar, clock icons; flat arm/hand; coffee can*

---

### ***Concept 3 — "The Science of Smooth" (Explainer Style)***

***Logline:** Kurzgesagt-style mini explainer on why cold brew tastes smoother — fun, fast, brand-forward. **Duration:** 30 seconds | **Format:** 1080×1080*

| *Scene* | *Frames (@ 30fps)* | *Description* |
| ----- | ----- | ----- |
| ***Hook*** | *0–30* | *Text animates in: "Why does cold brew taste smoother?" — coffee bean SVG bounces in from top* |
| ***Hot brew contrast*** | *30–90* | *Diagram: flame SVG heats a bean → jagged red "bitter molecule" shapes fly out aggressively* |
| ***Cold brew reveal*** | *90–150* | *Diagram: ice SVG meets a bean → rounded blue "smooth molecule" shapes float out gently* |
| ***Benefit callouts*** | *150–210* | *Three icons pop in sequentially with labels: 🧊 Low acid · ✨ No bitterness · ☕ Smooth sip* |
| ***CTA*** | *210–270* | *Can SVG slides to center; text animates: **"Try It Today"*** |

* ***Suggested CTA:** `Try It Today`*  
* ***Key SVGs needed:** coffee bean, flame, ice cube, molecule shapes (jagged red vs rounded blue), 3 benefit icon set*

---

## ***8\. Campaign Do's & Don'ts***

| *✅ Do* | *❌ Don't* |
| ----- | ----- |
| *Build all scenes from SVG shapes and React components* | *Use raw video footage or live-action clips* |
| *Use smooth spring/ease-in-out animation curves* | *Use linear animation — it feels robotic* |
| *Animate all typography — no static text on screen* | *Drop text in without entrance motion* |
| *Keep each scene beat to 1.5–3 seconds* | *Let scenes linger — pacing is everything* |
| *Use the brand color palette strictly* | *Introduce off-brand colors for variety* |
| *Layer flat illustrated characters over product assets* | *Rely on product PNGs as the sole visual* |
| *End every video with an animated CTA* | *Fade to black without a clear next step* |

---

## ***9\. Agent Reference Summary***

| *Agent* | *Key Sections to Reference* |
| ----- | ----- |
| ***Video Agent (Remotion)*** | *Production Constraints · Motion Style · Video Campaign Concepts · Do's & Don'ts* |
| ***Image Agent*** | *Visual Assets · Product Features · Brand Color Palette* |

---

*Last updated: March 2026 · Maintained by: Brand Team*


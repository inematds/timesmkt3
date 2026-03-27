---
name: orchestrator
description: >
  Runs the full AI content pipeline as a single coordinated workflow using BullMQ and Redis. Use
  when the user asks to "run the pipeline", "start the campaign", "kick off the full workflow",
  "orchestrate the agents", "run all agents", or provides a job payload with task_name and
  task_date. Manages agent dependency ordering, validates skip conditions, enqueues BullMQ jobs,
  and tracks completion status. Always use this skill when multiple agents need to run in sequence
  or parallel for a single campaign. Do NOT use for running a single agent in isolation.
---

# Orchestrator

Receives a Job Payload and runs the full AI content pipeline as a coordinated BullMQ workflow. Validates inputs, respects skip flags, enforces dependency ordering, and tracks every agent's job status through to the Distribution Agent.

## When to Use This Skill

- User says "run the pipeline", "start the campaign", "orchestrate all agents"
- User provides a task_name and task_date and wants all agents to run
- User wants to skip specific agents (research, image, or video) but still run the full pipeline
- User wants to track which jobs are queued, running, complete, or failed

---

## CRITICAL: Dependency Order

The pipeline must always respect this execution order:

```
Research Agent
    │
    ├──► Ad Creative Designer  ─┐
    ├──► Video Ad Specialist   ─┼──► Distribution Agent
    └──► Copywriter Agent      ─┘
```

- **Research Agent** runs first (unless skipped with a validated source folder)
- **Ad Creative Designer**, **Video Ad Specialist**, and **Copywriter Agent** run in parallel after research completes
- **Distribution Agent** runs last, only after all three middle agents complete (or are skipped)

---

## Step 1: Receive and Validate Job Payload

Accept a Job Payload as JSON. Required and optional fields:

```json
{
  "task_name": "coldbrew_campaign",
  "task_date": "2026-03-15",
  "project_dir": "prj/coldbrew-coffee-co",
  "platform_targets": ["instagram", "youtube"],
  "skip_research": false,
  "skip_image": false,
  "skip_video": false,
  "source_folder": null
}
```

### Validation Rules

| Field | Required | Rule |
|---|---|---|
| `task_name` | Yes | Non-empty string, used in folder names and job IDs |
| `task_date` | Yes | Format `YYYY-MM-DD` |
| `platform_targets` | Yes | Array containing at least one of: `instagram`, `youtube` |
| `skip_research` | No | Default `false`. If `true`, `source_folder` or `<project_dir>/assets/<task_name>/` must exist |
| `skip_image` | No | Default `false`. If `true`, Ad Creative Designer is marked complete without running |
| `skip_video` | No | Default `false`. If `true`, Video Ad Specialist is marked complete without running |
| `source_folder` | No | Path to pre-existing assets folder if skipping research |

### Skip Research Validation

If `skip_research` is `true`:
- Check if `<project_dir>/assets/<task_name>/` exists in the project root
- If not found, **block the pipeline** and return:
  ```
  Task cannot proceed until source folder is uploaded.
  Upload assets to: assets/<task_name>/
  ```
- If found, confirm the folder path and proceed

---

## Step 2: Enqueue Jobs via BullMQ

Run the orchestrator script to enqueue all jobs:

```bash
node pipeline/orchestrator.js --payload '{"task_name":"coldbrew_campaign","task_date":"2026-03-15","platform_targets":["instagram","youtube"]}'
```

Or using a saved payload file:

```bash
node pipeline/orchestrator.js --file pipeline/payloads/coldbrew_demo.json
```

Or via npm:

```bash
npm run pipeline:run
```

The orchestrator will:
1. Validate the payload
2. Determine which jobs to skip
3. Enqueue each agent as a BullMQ job on the `ai-content-pipeline` queue
4. Print a job summary table

### Expected Output Per Job

```json
{
  "job_name": "video_ad_specialist",
  "job_id": "42",
  "status": "queued",
  "dependencies": ["research_agent"],
  "notes": "Waiting on: research_agent"
}
```

Job statuses: `queued` · `running` · `complete` · `failed`

Skipped jobs return immediately as `complete` with a note:
```json
{
  "job_name": "ad_creative_designer",
  "status": "complete",
  "dependencies": ["research_agent"],
  "notes": "Skipped per user flag: skip_image"
}
```

---

## Step 3: Start the Worker

In a separate terminal, start the BullMQ worker to process queued jobs:

```bash
node pipeline/worker.js
```

Or via npm:

```bash
npm run pipeline:worker
```

The worker processes up to 3 jobs concurrently (configurable in `pipeline/worker.js`). Video Ad Specialist and Ad Creative Designer can run in parallel after Research Agent completes.

---

## Step 4: Track Job Status

Monitor job progress by reading log files generated per agent:

```
<project_dir>/outputs/<task_name>_<date>/logs/
├── research_agent.log
├── ad_creative_designer.log
├── video_ad_specialist.log
├── copywriter_agent.log
├── distribution_agent.log
└── <agent>_error.log  ← only on failure
```

Each log entry includes a timestamp and status message. Report to the user:

- Which agents are queued, running, complete, or failed
- The output path of each completed agent
- Any error messages from failed agents

---

## Step 5: Handle Failures

If a job fails:
- BullMQ retries automatically up to 3 times with exponential backoff (5s base)
- After 3 failures, the job is marked `failed` and an error log is written
- Report the failure to the user with the error message and log file path
- Suggest remediation: fix the issue, then re-enqueue the specific failed job by re-running the orchestrator with the same payload

---

## Step 6: Report Pipeline Completion

Once all jobs reach `complete` (or `complete/skipped`), generate a final pipeline summary:

```
── Pipeline Complete: coldbrew_campaign (2026-03-15) ──────────────────

  research_agent         ✅ complete  → <project_dir>/outputs/coldbrew_campaign_2026-03-15/research_results.json
  ad_creative_designer   ✅ complete  → <project_dir>/outputs/coldbrew_campaign_2026-03-15/ads/layout.json
  video_ad_specialist    ⏭  skipped   → skip_video flag
  copywriter_agent       ✅ complete  → <project_dir>/outputs/coldbrew_campaign_2026-03-15/copy/
  distribution_agent     ✅ complete  → <project_dir>/outputs/coldbrew_campaign_2026-03-15/Publish coldbrew_campaign 2026-03-15.md

  Next step: Reference "Publish coldbrew_campaign 2026-03-15.md" to trigger publishing.

───────────────────────────────────────────────────────────────────────
```

---

## Pipeline Output Folder Structure

```
<project_dir>/outputs/<task_name>_<date>/
├── research_results.json
├── research_brief.md
├── interactive_report.html
├── media_urls.json
├── ads/
│   └── layout.json
├── video/
│   └── ad.mp4
├── copy/
│   ├── instagram_caption.txt
│   ├── threads_post.txt
│   └── youtube_metadata.json
├── logs/
│   ├── research_agent.log
│   ├── copywriter_agent.log
│   └── distribution_agent.log
└── Publish <task_name> <date>.md
```

---

## Skip Scenarios Reference

| Scenario | Flags | What Happens |
|---|---|---|
| Full pipeline | all false | All 5 agents run in order |
| Skip research, have assets | `skip_research: true` | Verify `<project_dir>/assets/<task_name>/`, then run remaining agents |
| Image-only campaign | `skip_video: true` | Video job marked complete, pipeline continues |
| Video-only campaign | `skip_image: true` | Image job marked complete, pipeline continues |
| Copy + distribute only | `skip_research`, `skip_image`, `skip_video` all true | Runs Copywriter + Distribution only |

---

## Troubleshooting

### Redis connection refused
Check that `UPSTASH_REDIS_ENDPOINT` and `UPSTASH_REDIS_PASSWORD` are set correctly in `.env`. Get the values from the Upstash dashboard → your Redis database → Connect → ioredis tab.

### Job stuck in `queued` state
The worker is not running. Start it in a separate terminal: `npm run pipeline:worker`.

### Research skip fails — source folder missing
Upload media assets to `<project_dir>/assets/<task_name>/` before re-running. The pipeline will not proceed until this folder exists.

### Distribution Agent runs before copy is ready
BullMQ concurrency may have advanced it too quickly. Check that `copywriter_agent` shows `complete` in logs before Distribution starts. Adjust worker concurrency in `pipeline/worker.js` if needed.

---

## Quality Checklist

Before reporting pipeline complete, verify:

- [ ] Job payload validated — no missing required fields
- [ ] `skip_research` validated against `<project_dir>/assets/<task_name>/` if true
- [ ] All jobs enqueued successfully with correct dependencies
- [ ] Worker running and processing jobs
- [ ] Logs written for each agent to `<project_dir>/outputs/<task_name>_<date>/logs/`
- [ ] Distribution Agent ran last and Publish MD exists
- [ ] User notified of Publish MD location and how to trigger publishing

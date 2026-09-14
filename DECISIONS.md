# Decisions

Shared, agent-authored log of cross-cutting decisions the fleet must honor. The conductor records plan/steer decisions here; workers record interface contracts + adjustments. Re-read before each significant step.

## Plan approved
- **What:** Approved a 1-task plan for: ok is fitdash up and running? if not improve it? make sure it runs at 12:30 AM everyday instead of whatever it is today.. Tasks: Fix morning reminder schedule.
- **Why:** user-approved plan; workers implement these nodes in isolated workspaces, honoring the dependency edges
- **By:** conductor · 1784234365331

## n0: Moved the Fly.io exercise reminder from the 8:00-8:30 PM
- **Did:** Moved the Fly.io exercise reminder from the 8:00-8:30 PM window to one deterministic randomized fire daily from 8:00:00 through 8:30:00 AM America/Los_Angeles. The date-stable target prevents duplicate same-day fires after process restarts and the UTC conversion tracks Pacific DST. Left protein nudge, cache warming, grocery list, weekly retrospective, PR check, routes, and deployment manifests unchanged. Production evidence on July 16, 2026: Fly machine 6834214f159928 was started in sjc; https://fit-dash.fly.dev/ returned HTTP 200 in 0.183s; /api/health returned HTTP 200 in 0.147s with success true but empty data; recent Fly logs showed repeated ENOTFOUND for polished-hare-7050.upstash.io, so production is reachable but Redis-backed data/reminder behavior is degraded. Validation: focused 370-day/DST/restart checks passed, exactly one exercise-reminder scheduler call remains, and pnpm build passed.
- **Interfaces:** Modified src/lib/cache-warmer.ts only. Added private Pacific date/time conversion and deterministic exercise-reminder target helpers; no public routes, manifests, package files, or external interfaces changed.
- **Follow-ups:**
  - Deploy the integrated scheduler change to Fly.io [out of lane] — This worker changed only the isolated local jj workspace; the live Fly image still uses the previous evening schedule until the coordinator integrates, pushes, and deploys.
  - Repair the deployed Upstash Redis endpoint [out of lane] — Fly logs on July 16, 2026 repeatedly show DNS ENOTFOUND for polished-hare-7050.upstash.io; the exercise reminder reads its workouts from Redis and may return 500 until the secret points to a working Redis instance.
- **By:** n0 · 2026-07-16T20:44:31.769Z


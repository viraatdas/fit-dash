# Fitness Dashboard

A fitness tracking dashboard that pulls workout data from Notion, categorizes exercises, and displays trend charts.

## Features

- **Notion Integration**: Automatically parses workout data from your Notion page
- **Exercise Categorization**: Categorizes exercises into Upper Body, Lower Body, Back, Core, and Cardio
- **Weight Progress Charts**: Track your progress for any exercise over time
- **InBody Tracking**: Manually input and track body composition data
- **Responsive Design**: Works on desktop and mobile

## Setup

### 1. Create a Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click "New integration"
3. Name it (e.g., "Fitness Dashboard")
4. Select your workspace
5. Click "Submit"
6. Copy the "Internal Integration Secret" (starts with `secret_` or `ntn_`)

### 2. Share Your Workout Page with the Integration

**This step is required!**

1. Open your workout page in Notion
2. Click the "..." menu (top right)
3. Click "Connections" (or "Add connections")
4. Search for your integration name
5. Click to add the connection

### 3. Get Your Page ID

1. Open your workout page in Notion
2. Look at the URL: `https://www.notion.so/Your-Page-Title-abc123def456...`
3. The page ID is the 32-character string after the title
   - Example: `abc123def456789012345678901234567`

### 4. Configure Environment Variables

Create a `.env.local` file in the project root:

```
NOTION_API_KEY=your_integration_secret_here
NOTION_PAGE_ID=your_page_id_here
```

### 5. Install and Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 to view the dashboard.

## Workout Log Format

The parser expects workout entries in your Notion page formatted like:

```
# January 29, 2026

Bench Press: 135x10, 155x8, 175x6
Squat: 225 x 5 x 3
Bicep Curl: 40+40 x 10
Pull ups: 10, 8, 6

# January 27, 2026

Deadlift: 315x5, 335x3
Lat Pulldown: 120x12, 140x10
```

### Supported Date Formats
- `January 29, 2026`
- `2026-01-29`
- `01/29/2026`

### Supported Weight Formats
- `135` - 135 lbs
- `40+40` - Per-side notation (equals 80 lbs)
- `40 + 40` - Same as above with spaces

### Supported Set Formats
- `135x10, 155x8` - Multiple sets with different weights
- `225 x 5 x 3` - Same weight, 5 reps, 3 sets
- `3x10` - Bodyweight exercise, 3 sets of 10
- `10, 8, 6` - Just reps (bodyweight)

## Deployment to Vercel

1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `NOTION_API_KEY`
   - `NOTION_PAGE_ID`
4. Deploy

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Recharts
- @notionhq/client

## Code-Control MCP API

This app exposes an authenticated MCP-style code-control endpoint for local bots and automations.

### Authentication

Use one of:

```bash
Authorization: Bearer <MCP_API_KEY>
x-api-key: <MCP_API_KEY>
?key=<MCP_API_KEY>
```

Local development can read the key from `.mcp-api-key`. Deployments should set `MCP_API_KEY` as an environment variable.

### MCP endpoint

`POST /api/mcp` supports:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Example:

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"project.list_files","arguments":{"glob":"src/**/*.tsx","limit":20}}}'
```

Available tools:

- `project.list_files`
- `project.read_file`
- `project.write_file`
- `project.patch_file`
- `project.delete_file`
- `project.search`
- `theme.get_tokens`
- `theme.update_tokens`

Secret files such as `.env*` and `.mcp-api-key` are blocked by default. Set `MCP_ALLOW_SECRET_FILE_ACCESS=true` only if you intentionally want the bot to access those files.

### Moobot bridge

For URL-based bot integrations, call `GET /api/moobot` with `tool` and either individual arguments or an encoded JSON `args` object:

```bash
curl "http://localhost:3000/api/moobot?key=$MCP_API_KEY&tool=theme.get_tokens&mode=dark"
```

Patch a file:

```bash
curl "http://localhost:3000/api/moobot?key=$MCP_API_KEY&tool=project.patch_file&path=src/app/page.tsx&search=Fitness%20Dashboard&replace=Fit%20Dash"
```

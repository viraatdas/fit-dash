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

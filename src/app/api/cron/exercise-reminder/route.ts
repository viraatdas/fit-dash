import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getNotionClient, getPageId } from '@/lib/notion';
import { parseNotionPage } from '@/lib/notion/parser';
import { format, differenceInDays } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Fetch workouts from Notion
    const notion = getNotionClient();
    const pageId = getPageId();

    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const response = await notion.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 30,
      });
      blocks.push(...(response.results as NotionBlock[]));
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    // Fetch children for exercises
    const blocksWithChildren: Array<NotionBlock & { children?: NotionBlock[] }> = [];
    for (const block of blocks) {
      if (block.has_children && block.type === 'numbered_list_item') {
        const childResponse = await notion.blocks.children.list({ block_id: block.id, page_size: 50 });
        blocksWithChildren.push({ ...block, children: childResponse.results as NotionBlock[] });
      } else {
        blocksWithChildren.push(block);
      }
    }

    const workouts = await parseNotionPage(blocksWithChildren);

    if (workouts.length === 0) {
      return NextResponse.json({ message: 'No workouts found, skipping email' });
    }

    const lastWorkout = workouts[0];
    const daysSinceLastWorkout = differenceInDays(new Date(), lastWorkout.date);

    // Only send emails if more than 3 days since last workout
    if (daysSinceLastWorkout <= 3) {
      return NextResponse.json({
        message: `Last workout was ${daysSinceLastWorkout} days ago. No reminder needed.`,
        lastWorkoutDate: lastWorkout.date,
      });
    }

    const resend = new Resend(resendKey);
    const lastWorkoutDate = format(lastWorkout.date, 'EEEE, MMMM d, yyyy');
    const exerciseList = lastWorkout.exercises
      .filter(e => e.sets.length > 0)
      .map(e => {
        const maxWeight = Math.max(...e.sets.map(s => s.weight));
        const totalSets = e.sets.length;
        const avgReps = Math.round(e.sets.reduce((s, set) => s + set.reps, 0) / totalSets);
        return `${e.normalizedName}: ${totalSets} sets, ~${avgReps} reps, max ${maxWeight} lbs`;
      })
      .join('\n');

    // Email to Viraat
    await resend.emails.send({
      from: 'FitDash <onboarding@resend.dev>',
      to: 'viraat@exla.ai',
      subject: `You haven't exercised in ${daysSinceLastWorkout} days`,
      html: `
        <div style="font-family: 'Space Grotesk', system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #000000; color: #E8E8E8; padding: 32px;">
          <div style="border-bottom: 1px solid #222222; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="font-family: 'Space Mono', monospace; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #999999; margin: 0;">FitDash Reminder</h1>
          </div>

          <div style="margin-bottom: 32px;">
            <p style="font-size: 24px; color: #D71921; font-family: 'Space Mono', monospace; margin: 0 0 8px 0;">
              ${daysSinceLastWorkout} DAYS
            </p>
            <p style="font-family: 'Space Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #666666;">
              since your last workout
            </p>
          </div>

          <div style="background: #111111; border: 1px solid #222222; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="font-family: 'Space Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #999999; margin: 0 0 12px 0;">
              Last Workout: ${lastWorkoutDate}
            </p>
            <pre style="font-family: 'Space Mono', monospace; font-size: 12px; color: #E8E8E8; margin: 0; white-space: pre-wrap;">${exerciseList || 'No exercise data'}</pre>
          </div>

          <p style="color: #999999; font-size: 14px; line-height: 1.6;">
            You've been making progress. Don't let it slip. Even a light session keeps the momentum going.
          </p>

          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #222222;">
            <a href="https://fitdash.viraat.dev" style="display: inline-block; background: #FFFFFF; color: #000000; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-family: 'Space Mono', monospace; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
              View Dashboard
            </a>
          </div>
        </div>
      `,
    });

    // Email to Krithik
    await resend.emails.send({
      from: 'FitDash <onboarding@resend.dev>',
      to: 'krithik2000@gmail.com',
      subject: `Viraat hasn't been exercising`,
      html: `
        <div style="font-family: 'Space Grotesk', system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #000000; color: #E8E8E8; padding: 32px;">
          <div style="border-bottom: 1px solid #222222; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="font-family: 'Space Mono', monospace; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #999999; margin: 0;">FitDash Alert</h1>
          </div>

          <div style="margin-bottom: 24px;">
            <p style="font-size: 20px; color: #D71921; font-family: 'Space Mono', monospace; margin: 0 0 16px 0;">
              INACTIVITY DETECTED
            </p>
            <p style="color: #E8E8E8; font-size: 16px; line-height: 1.6; margin: 0;">
              FitDash has detected that Viraat is not exercising. His last workout was <strong>${daysSinceLastWorkout} days ago</strong> on ${lastWorkoutDate}.
            </p>
          </div>

          <div style="background: #111111; border: 1px solid #D71921; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #E8E8E8; font-size: 16px; line-height: 1.6; margin: 0;">
              That means almost certainly that you aren't exercising either. So fix it.
            </p>
          </div>

          <p style="font-family: 'Space Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #666666;">
            — Sent automatically by FitDash
          </p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      daysSinceLastWorkout,
      lastWorkoutDate: lastWorkout.date,
      emailsSent: ['viraat@exla.ai', 'krithik2000@gmail.com'],
    });
  } catch (error) {
    console.error('Exercise reminder cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send reminder' },
      { status: 500 }
    );
  }
}

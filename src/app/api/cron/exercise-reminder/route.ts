import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getRedis } from '@/lib/redis';
import { Workout } from '@/types';
import { format, differenceInDays, subDays } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Read workouts from Redis cache (already populated by cache warmer)
    const redis = getRedis();
    let workouts: Workout[] = [];

    if (redis) {
      const cached = await redis.get('fitdash:workouts');
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        workouts = Array.isArray(data) ? data : [];
      }
    }

    if (workouts.length === 0) {
      return NextResponse.json({ message: 'No workouts in cache, skipping email' });
    }

    // Build workout rundown for the past 7 days
    const now = new Date();
    const lastWorkout = workouts[0];
    const lastWorkoutDate = new Date(lastWorkout.date);
    const daysSinceLastWorkout = differenceInDays(now, lastWorkoutDate);

    const sevenDaysAgo = subDays(now, 7);
    const recentWorkouts = workouts.filter(w => new Date(w.date) >= sevenDaysAgo);

    const recentSummaryHtml = recentWorkouts.length > 0
      ? recentWorkouts.map(w => {
          const dateStr = format(new Date(w.date), 'EEE, MMM d');
          const exercises = w.exercises
            .filter((e: { sets: Array<{ weight: number; reps: number }> }) => e.sets.length > 0)
            .map((e: { normalizedName: string; sets: Array<{ weight: number; reps: number }> }) => {
              const maxWeight = Math.max(...e.sets.map(s => s.weight));
              return `${e.normalizedName} (max ${maxWeight} lbs)`;
            })
            .join(', ');
          return `<p style="margin: 4px 0; font-size: 13px;"><strong style="color: #E8E8E8;">${dateStr}</strong> — <span style="color: #999999;">${exercises || 'No tracked exercises'}</span></p>`;
        }).join('')
      : '<p style="color: #666666; font-size: 13px;">No workouts in the past 7 days.</p>';

    // Status message
    let statusMessage: string;
    let statusColor: string;
    if (daysSinceLastWorkout === 0) {
      statusMessage = 'You worked out today. Keep the streak going tomorrow.';
      statusColor = '#22C55E';
    } else if (daysSinceLastWorkout <= 2) {
      statusMessage = `Last workout was ${daysSinceLastWorkout} day${daysSinceLastWorkout > 1 ? 's' : ''} ago. Time to get back in.`;
      statusColor = '#E8E8E8';
    } else {
      statusMessage = `It's been ${daysSinceLastWorkout} days since your last workout. Don't let the momentum slip.`;
      statusColor = '#D71921';
    }

    const resend = new Resend(resendKey);

    // Email to Viraat — daily with rundown
    await resend.emails.send({
      from: 'FitDash <onboarding@resend.dev>',
      to: 'viraat@exla.ai',
      subject: daysSinceLastWorkout === 0
        ? 'Daily fitness rundown'
        : `${daysSinceLastWorkout} day${daysSinceLastWorkout > 1 ? 's' : ''} since last workout`,
      html: `
        <div style="font-family: 'Space Grotesk', system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #000000; color: #E8E8E8; padding: 32px;">
          <div style="border-bottom: 1px solid #222222; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="font-family: 'Space Mono', monospace; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #999999; margin: 0;">FitDash Daily</h1>
          </div>

          <div style="margin-bottom: 24px;">
            <p style="font-size: 16px; color: ${statusColor}; line-height: 1.5; margin: 0;">
              ${statusMessage}
            </p>
          </div>

          <div style="background: #111111; border: 1px solid #222222; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="font-family: 'Space Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #999999; margin: 0 0 12px 0;">
              Last 7 Days
            </p>
            ${recentSummaryHtml}
          </div>

          <div style="margin-bottom: 24px;">
            <p style="font-family: 'Space Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #666666; margin: 0;">
              ${recentWorkouts.length} workout${recentWorkouts.length !== 1 ? 's' : ''} this week
            </p>
          </div>

          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #222222;">
            <a href="https://fitdash.viraat.dev" style="display: inline-block; background: #FFFFFF; color: #000000; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-family: 'Space Mono', monospace; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
              View Dashboard
            </a>
          </div>
        </div>
      `,
    });

    // Email to Krithik only if > 3 days
    if (daysSinceLastWorkout > 3) {
      await resend.emails.send({
        from: 'FitDash <onboarding@resend.dev>',
        to: 'krithik2000@gmail.com',
        subject: `Viraat hasn't been exercising`,
        html: `
          <div style="font-family: 'Space Grotesk', system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #000000; color: #E8E8E8; padding: 32px;">
            <div style="border-bottom: 1px solid #222222; padding-bottom: 16px; margin-bottom: 24px;">
              <h1 style="font-family: 'Space Mono', monospace; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #999999; margin: 0;">FitDash Alert</h1>
            </div>
            <p style="font-size: 20px; color: #D71921; font-family: 'Space Mono', monospace; margin: 0 0 16px 0;">
              INACTIVITY DETECTED
            </p>
            <p style="color: #E8E8E8; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
              Viraat's last workout was <strong>${daysSinceLastWorkout} days ago</strong> on ${format(lastWorkoutDate, 'EEEE, MMMM d')}.
            </p>
            <div style="background: #111111; border: 1px solid #D71921; border-radius: 8px; padding: 20px;">
              <p style="color: #E8E8E8; font-size: 16px; line-height: 1.6; margin: 0;">
                That means almost certainly that you aren't exercising either. So fix it.
              </p>
            </div>
            <p style="font-family: 'Space Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #666666; margin-top: 24px;">
              — Sent automatically by FitDash
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({
      success: true,
      daysSinceLastWorkout,
      emailsSent: daysSinceLastWorkout > 3
        ? ['viraat@exla.ai', 'krithik2000@gmail.com']
        : ['viraat@exla.ai'],
    });
  } catch (error) {
    console.error('Exercise reminder cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send reminder' },
      { status: 500 },
    );
  }
}

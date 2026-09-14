import { NextResponse } from 'next/server';
import { generateText, extractJson, isLLMConfigured } from '@/lib/llm';

export async function POST(request: Request) {
  if (!isLLMConfigured()) {
    return NextResponse.json({ error: 'LLM not configured' }, { status: 500 });
  }

  try {
    const { workouts, inBody, prompt: customPrompt } = await request.json();

    const prompt = customPrompt || `You are a fitness coach analyzing a client's workout data. Their goals are:
1. Aesthetically look good (build muscle, reduce body fat)
2. Functional strength - be able to lift more and perform better in daily life

Here's their recent workout data:
${JSON.stringify(workouts, null, 2)}

Here's their body composition data (InBody measurements):
${JSON.stringify(inBody, null, 2)}

Based on this data, provide:
1. A brief analysis (2-3 sentences) of their current training and progress
2. 3-4 specific, actionable recommendations to help them reach their goals
3. 2-3 focus areas they should prioritize

Respond in JSON format:
{
  "analysis": "Brief analysis here",
  "recommendations": ["Recommendation 1", "Recommendation 2", ...],
  "focus_areas": ["Focus area 1", "Focus area 2", ...]
}`;

    const text = await generateText(prompt, { jsonObject: true });

    const insights = extractJson<Record<string, unknown>>(text, 'object');
    if (!insights) {
      throw new Error('Could not parse AI response');
    }

    return NextResponse.json(insights);
  } catch (error) {
    console.error('AI insights error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate insights' },
      { status: 500 }
    );
  }
}

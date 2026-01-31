import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: Request) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured' },
      { status: 500 }
    );
  }

  try {
    const { workouts, inBody } = await request.json();

    const client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    const prompt = `You are a fitness coach analyzing a client's workout data. Their goals are:
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

Consider:
- Training frequency and consistency
- Exercise selection and muscle group balance
- Progressive overload (are weights increasing?)
- Body composition changes
- Recovery needs
- Compound vs isolation movements for functional strength

Respond in JSON format:
{
  "analysis": "Brief analysis here",
  "recommendations": ["Recommendation 1", "Recommendation 2", ...],
  "focus_areas": ["Focus area 1", "Focus area 2", ...]
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from AI');
    }

    // Parse the JSON from the response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse AI response');
    }

    const insights = JSON.parse(jsonMatch[0]);

    return NextResponse.json(insights);
  } catch (error) {
    console.error('AI insights error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate insights' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  try {
    const { workouts, inBody, prompt: customPrompt } = await request.json();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
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

import { GoogleGenerativeAI } from '@google/generative-ai';
import { FoodDay, FoodItem, NutrientInfo } from '@/types';

interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

interface RichText {
  plain_text: string;
  type?: string;
  mention?: {
    type: string;
    date?: { start: string };
  };
}

function getBlockText(block: NotionBlock): string {
  const type = block.type as keyof NotionBlock;
  const content = block[type];
  if (content && typeof content === 'object' && 'rich_text' in content) {
    return (content.rich_text as RichText[]).map(t => t.plain_text).join('');
  }
  return '';
}

function getDateFromBlock(block: NotionBlock): string | null {
  const type = block.type as keyof NotionBlock;
  const content = block[type];
  if (content && typeof content === 'object' && 'rich_text' in content) {
    for (const rt of content.rich_text as RichText[]) {
      if (rt.type === 'mention' && rt.mention?.type === 'date' && rt.mention.date?.start) {
        return rt.mention.date.start;
      }
    }
  }
  // Try text-based date
  const text = getBlockText(block).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function getImageUrl(block: NotionBlock): string | null {
  if (block.type !== 'image') return null;
  const img = block.image as { file?: { url: string }; external?: { url: string } };
  return img?.file?.url || img?.external?.url || null;
}

interface RawFoodDay {
  date: string;
  texts: string[];
  imageUrls: string[];
}

export function parseFoodBlocks(blocks: NotionBlock[]): RawFoodDay[] {
  const days: RawFoodDay[] = [];
  let currentDay: RawFoodDay | null = null;

  for (const block of blocks) {
    const date = getDateFromBlock(block);
    if (date) {
      if (currentDay && (currentDay.texts.length > 0 || currentDay.imageUrls.length > 0)) {
        days.push(currentDay);
      }
      currentDay = { date, texts: [], imageUrls: [] };
      continue;
    }

    if (!currentDay) continue;

    if (block.type === 'image') {
      const url = getImageUrl(block);
      if (url) currentDay.imageUrls.push(url);
    } else if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item' || block.type === 'paragraph') {
      const text = getBlockText(block).trim();
      if (text) currentDay.texts.push(text);
    }
  }

  if (currentDay && (currentDay.texts.length > 0 || currentDay.imageUrls.length > 0)) {
    days.push(currentDay);
  }

  return days;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    return { data: Buffer.from(buffer).toString('base64'), mimeType };
  } catch {
    return null;
  }
}

function sumNutrients(items: FoodItem[]): NutrientInfo {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.nutrients.calories,
      protein: acc.protein + item.nutrients.protein,
      carbs: acc.carbs + item.nutrients.carbs,
      fat: acc.fat + item.nutrients.fat,
      fiber: acc.fiber + item.nutrients.fiber,
      sugar: (acc.sugar || 0) + (item.nutrients.sugar || 0),
      sodium: (acc.sodium || 0) + (item.nutrients.sodium || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
  );
}

export async function estimateNutrients(rawDays: RawFoodDay[]): Promise<FoodDay[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const results: FoodDay[] = [];

  for (const day of rawDays) {
    try {
      // Build parts for the prompt — include images if available
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

      // Add text prompt
      const foodDescriptions = day.texts.length > 0
        ? day.texts.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : 'See images below';

      parts.push({
        text: `Estimate the nutritional content of these food items consumed on ${day.date}. Be realistic with portion sizes based on typical servings.

Food items described:
${foodDescriptions}

${day.imageUrls.length > 0 ? `There are also ${day.imageUrls.length} food photo(s) attached. Analyze them and include their contents.` : ''}

For EACH food item (from both text and images), return a JSON array. If an image shows food not described in text, add it as a separate item.

Return ONLY valid JSON (no markdown, no code fences):
{
  "items": [
    {"description": "<food item>", "calories": <num>, "protein": <g>, "carbs": <g>, "fat": <g>, "fiber": <g>, "sugar": <g>, "sodium": <mg>}
  ]
}`,
      });

      // Add images as inline data (Notion URLs are temporary, must download)
      for (const imageUrl of day.imageUrls) {
        const imageData = await fetchImageAsBase64(imageUrl);
        if (imageData) {
          parts.push({ inlineData: imageData });
        }
      }

      const result = await model.generateContent(parts);
      const text = result.response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      const items: FoodItem[] = (parsed.items || []).map((item: {
        description: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
        sugar?: number;
        sodium?: number;
      }) => ({
        description: item.description,
        nutrients: {
          calories: Math.round(item.calories || 0),
          protein: Math.round(item.protein || 0),
          carbs: Math.round(item.carbs || 0),
          fat: Math.round(item.fat || 0),
          fiber: Math.round(item.fiber || 0),
          sugar: Math.round(item.sugar || 0),
          sodium: Math.round(item.sodium || 0),
        },
      }));

      results.push({
        date: day.date,
        items,
        totals: sumNutrients(items),
      });
    } catch (err) {
      console.error(`Failed to estimate nutrients for ${day.date}:`, err);
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}

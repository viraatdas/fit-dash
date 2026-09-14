import { Client } from '@notionhq/client';

let notionClient: Client | null = null;

/**
 * Strip stray whitespace AND a literal trailing "\n" (two chars: backslash,
 * n) baked into some locally-pulled .env.local values, e.g. `KEY="secret\n"`
 * — dotenv expands that escape into a real trailing newline, which breaks
 * `Authorization` headers and request URLs ("Invalid request URL"). Prod
 * secrets don't have this artifact, so this is a no-op there.
 */
function cleanEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(/\\n$/, '').trim();
}

export function getNotionClient(): Client {
  if (!notionClient) {
    const apiKey = cleanEnvValue(process.env.NOTION_API_KEY);
    if (!apiKey) {
      throw new Error('NOTION_API_KEY environment variable is not set');
    }
    notionClient = new Client({ auth: apiKey });
  }
  return notionClient;
}

export function getPageId(): string {
  const pageId = cleanEnvValue(process.env.NOTION_PAGE_ID);
  if (!pageId) {
    throw new Error('NOTION_PAGE_ID environment variable is not set');
  }
  return pageId;
}

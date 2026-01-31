import { Client } from '@notionhq/client';

let notionClient: Client | null = null;

export function getNotionClient(): Client {
  if (!notionClient) {
    const apiKey = process.env.NOTION_API_KEY;
    if (!apiKey) {
      throw new Error('NOTION_API_KEY environment variable is not set');
    }
    notionClient = new Client({ auth: apiKey });
  }
  return notionClient;
}

export function getPageId(): string {
  const pageId = process.env.NOTION_PAGE_ID;
  if (!pageId) {
    throw new Error('NOTION_PAGE_ID environment variable is not set');
  }
  return pageId;
}

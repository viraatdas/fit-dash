import { NextResponse } from 'next/server';
import { getNotionClient, getPageId } from '@/lib/notion';
import { parseNotionPage } from '@/lib/notion/parser';

export const dynamic = 'force-dynamic';

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

export async function GET() {
  try {
    const notion = getNotionClient();
    const pageId = getPageId();

    // Fetch all top-level blocks from the page
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;

    do {
      const response = await notion.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 100,
      });

      blocks.push(...(response.results as NotionBlock[]));
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    // Fetch children for blocks that have them (exercises with sets)
    const blocksWithChildren: Array<NotionBlock & { children?: NotionBlock[] }> = [];

    for (const block of blocks) {
      if (block.has_children && block.type === 'numbered_list_item') {
        // Fetch children (the sets)
        const childResponse = await notion.blocks.children.list({
          block_id: block.id,
          page_size: 50,
        });
        blocksWithChildren.push({
          ...block,
          children: childResponse.results as NotionBlock[],
        });
      } else {
        blocksWithChildren.push(block);
      }
    }

    // Parse blocks into workouts
    const workouts = parseNotionPage(blocksWithChildren);

    return NextResponse.json({
      success: true,
      workouts,
      totalBlocks: blocks.length,
    });
  } catch (error) {
    console.error('Notion API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

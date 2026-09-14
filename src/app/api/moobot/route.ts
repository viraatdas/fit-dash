import { NextResponse } from 'next/server';
import { authorizeMcpRequest } from '@/lib/mcp/auth';
import { executeMcpTool } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function toPlainText(result: unknown, maxLength: number): string {
  if (
    result &&
    typeof result === 'object' &&
    'content' in result &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    const text = (result as { content: Array<{ text?: unknown }> }).content
      .map((item) => typeof item.text === 'string' ? item.text : '')
      .filter(Boolean)
      .join('\n');

    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  const text = JSON.stringify(result, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function argsFromSearchParams(searchParams: URLSearchParams): Record<string, unknown> {
  const argsParam = searchParams.get('args');
  if (argsParam) {
    const parsed = JSON.parse(argsParam);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('args must decode to a JSON object');
    }

    return parsed as Record<string, unknown>;
  }

  const args: Record<string, unknown> = {};
  for (const [key, value] of Array.from(searchParams.entries())) {
    if (['args', 'json', 'key', 'maxLength', 'tool'].includes(key)) {
      continue;
    }

    if (value === 'true') {
      args[key] = true;
    } else if (value === 'false') {
      args[key] = false;
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      args[key] = Number(value);
    } else {
      args[key] = value;
    }
  }

  return args;
}

async function runTool(request: Request, tool: string, args: Record<string, unknown>, wantsJson: boolean, maxLength: number) {
  const auth = authorizeMcpRequest(request);
  if (!auth.ok) {
    return wantsJson
      ? NextResponse.json({ error: auth.error }, { status: auth.status })
      : new Response(auth.error, { status: auth.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  try {
    const result = await executeMcpTool(tool, args);
    return wantsJson
      ? NextResponse.json(result)
      : new Response(toPlainText(result, maxLength), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed';
    return wantsJson
      ? NextResponse.json({ error: message }, { status: 400 })
      : new Response(message, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tool = url.searchParams.get('tool') || '';
  const wantsJson = url.searchParams.get('json') === '1';
  const maxLength = Math.max(200, Math.min(8000, Number(url.searchParams.get('maxLength')) || 1600));

  if (!tool) {
    return wantsJson
      ? NextResponse.json({ error: 'Missing tool query param' }, { status: 400 })
      : new Response('Missing tool query param', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  try {
    return await runTool(request, tool, argsFromSearchParams(url.searchParams), wantsJson, maxLength);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid args';
    return wantsJson
      ? NextResponse.json({ error: message }, { status: 400 })
      : new Response(message, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

export async function POST(request: Request) {
  let body: { tool?: unknown; arguments?: unknown; maxLength?: unknown; json?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.tool !== 'string') {
    return NextResponse.json({ error: 'Missing tool' }, { status: 400 });
  }

  const args = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
    ? body.arguments as Record<string, unknown>
    : {};
  const maxLength = typeof body.maxLength === 'number' ? body.maxLength : 1600;

  return runTool(request, body.tool, args, body.json === true, maxLength);
}

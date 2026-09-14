import { timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

const API_KEY_FILE = '.mcp-api-key';

function readApiKeyFile(): string | null {
  try {
    return readFileSync(path.join(process.cwd(), API_KEY_FILE), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function getMcpApiKey(): string | null {
  return process.env.MCP_API_KEY || readApiKeyFile();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function getRequestApiKey(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const headerKey = request.headers.get('x-api-key');
  if (headerKey) {
    return headerKey.trim();
  }

  const url = new URL(request.url);
  return url.searchParams.get('key')?.trim() || null;
}

export function authorizeMcpRequest(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = getMcpApiKey();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: 'MCP_API_KEY is not configured. Set it in the environment or create .mcp-api-key.',
    };
  }

  const received = getRequestApiKey(request);
  if (!received || !safeEqual(received, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}

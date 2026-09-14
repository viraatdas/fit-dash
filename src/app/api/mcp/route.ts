import { NextResponse } from 'next/server';
import { authorizeMcpRequest } from '@/lib/mcp/auth';
import { executeMcpTool, mcpTools } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleJsonRpc(message: JsonRpcRequest) {
  try {
    if (!message || typeof message !== 'object') {
      return jsonRpcError(null, -32600, 'Invalid request');
    }

    switch (message.method) {
      case 'initialize':
        return jsonRpcResult(message.id, {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'fit-dash-code-control',
            version: '0.1.0',
          },
        });

      case 'ping':
        return jsonRpcResult(message.id, {});

      case 'tools/list':
        return jsonRpcResult(message.id, {
          tools: mcpTools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        });

      case 'tools/call': {
        const params = message.params || {};
        const name = typeof params.name === 'string' ? params.name : '';
        const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
          ? params.arguments as Record<string, unknown>
          : {};

        if (!name) {
          return jsonRpcError(message.id, -32602, 'tools/call requires params.name');
        }

        const result = await executeMcpTool(name, args);
        return jsonRpcResult(message.id, result);
      }

      case 'notifications/initialized':
        return new Response(null, { status: 202 });

      default:
        return jsonRpcError(message.id, -32601, `Unknown method: ${message.method || 'undefined'}`);
    }
  } catch (error) {
    return jsonRpcError(message.id, -32000, error instanceof Error ? error.message : 'Tool execution failed');
  }
}

export async function GET(request: Request) {
  const auth = authorizeMcpRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    name: 'fit-dash-code-control',
    endpoint: '/api/mcp',
    auth: 'Authorization: Bearer <MCP_API_KEY>, x-api-key, or ?key=',
    methods: ['initialize', 'ping', 'tools/list', 'tools/call'],
    tools: mcpTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  });
}

export async function POST(request: Request) {
  const auth = authorizeMcpRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(jsonRpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(handleJsonRpc));
    return NextResponse.json(results);
  }

  const result = await handleJsonRpc(body);
  if (result instanceof Response) {
    return result;
  }

  return NextResponse.json(result);
}

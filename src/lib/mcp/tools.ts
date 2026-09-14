import { promises as fs } from 'fs';
import path from 'path';

type JsonObject = Record<string, unknown>;

type ToolContent = {
  type: 'text';
  text: string;
};

export type ToolResult = {
  content: ToolContent[];
  isError?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  handler: (input: JsonObject) => Promise<ToolResult>;
};

const PROJECT_ROOT = process.cwd();
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_SEARCH_LIMIT = 40;
const EXCLUDED_DIRS = new Set([
  '.git',
  '.next',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.env',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown, defaultValue = false): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

function asNumber(value: unknown, defaultValue: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
}

function maxFileBytes(): number {
  const configured = Number(process.env.MCP_MAX_FILE_BYTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_FILE_BYTES;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\/+/, '');
}

function resolveProjectPath(inputPath: string): string {
  const resolved = path.resolve(PROJECT_ROOT, normalizeRelativePath(inputPath));
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep) ? PROJECT_ROOT : `${PROJECT_ROOT}${path.sep}`;

  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error('Path must stay inside the project root');
  }

  const parts = path.relative(PROJECT_ROOT, resolved).split(path.sep);
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) {
    throw new Error('Path is inside an excluded directory');
  }

  return resolved;
}

function relativeProjectPath(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath).replaceAll(path.sep, '/');
}

function blocksSecretFile(absolutePath: string): boolean {
  if (process.env.MCP_ALLOW_SECRET_FILE_ACCESS === 'true') {
    return false;
  }

  const baseName = path.basename(absolutePath);
  return baseName === '.mcp-api-key' || baseName === '.env' || baseName.startsWith('.env.');
}

async function assertTextFile(absolutePath: string): Promise<void> {
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error('Path is not a file');
  }

  if (stat.size > maxFileBytes()) {
    throw new Error(`File is too large. MCP_MAX_FILE_BYTES is ${maxFileBytes()}`);
  }

  const ext = path.extname(absolutePath).toLowerCase();
  if (ext && !TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`Refusing to treat ${ext} as text`);
  }
}

async function ensureWritablePath(absolutePath: string): Promise<void> {
  if (blocksSecretFile(absolutePath)) {
    throw new Error('Secret files are blocked. Set MCP_ALLOW_SECRET_FILE_ACCESS=true to override.');
  }

  const parent = path.dirname(absolutePath);
  const relativeParent = relativeProjectPath(parent);
  if (relativeParent && relativeParent.split('/').some((part) => EXCLUDED_DIRS.has(part))) {
    throw new Error('Cannot write inside an excluded directory');
  }
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${escaped}$`);
}

async function walkFiles(dir: string, limit: number, files: string[] = []): Promise<string[]> {
  if (files.length >= limit) {
    return files;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= limit) {
      break;
    }

    if (entry.name.startsWith('.') && entry.name !== '.gitignore') {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await walkFiles(absolutePath, limit, files);
      }
      continue;
    }

    if (entry.isFile() && !blocksSecretFile(absolutePath)) {
      files.push(relativeProjectPath(absolutePath));
    }
  }

  return files;
}

async function listFiles(input: JsonObject): Promise<ToolResult> {
  const limit = asNumber(input.limit, 200, 1, 1000);
  const glob = asOptionalString(input.glob);
  const regex = glob ? globToRegex(glob) : null;
  const files = await walkFiles(PROJECT_ROOT, limit * 4);
  const filtered = regex ? files.filter((file) => regex.test(file)).slice(0, limit) : files.slice(0, limit);

  return textResult(JSON.stringify({ root: PROJECT_ROOT, files: filtered }, null, 2));
}

async function readFile(input: JsonObject): Promise<ToolResult> {
  const targetPath = resolveProjectPath(asString(input.path, 'path'));
  if (blocksSecretFile(targetPath)) {
    throw new Error('Secret files are blocked. Set MCP_ALLOW_SECRET_FILE_ACCESS=true to override.');
  }

  await assertTextFile(targetPath);
  const content = await fs.readFile(targetPath, 'utf8');
  return textResult(content);
}

async function writeFile(input: JsonObject): Promise<ToolResult> {
  const targetPath = resolveProjectPath(asString(input.path, 'path'));
  const content = asString(input.content, 'content');
  const mode = input.mode === 'append' ? 'append' : 'overwrite';
  const createDirs = asBoolean(input.createDirs, true);

  if (Buffer.byteLength(content, 'utf8') > maxFileBytes()) {
    throw new Error(`Content is too large. MCP_MAX_FILE_BYTES is ${maxFileBytes()}`);
  }

  await ensureWritablePath(targetPath);
  if (createDirs) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
  }

  if (mode === 'append') {
    await fs.appendFile(targetPath, content, 'utf8');
  } else {
    await fs.writeFile(targetPath, content, 'utf8');
  }

  return textResult(JSON.stringify({
    path: relativeProjectPath(targetPath),
    mode,
    bytes: Buffer.byteLength(content, 'utf8'),
  }, null, 2));
}

async function patchFile(input: JsonObject): Promise<ToolResult> {
  const targetPath = resolveProjectPath(asString(input.path, 'path'));
  const search = asString(input.search, 'search');
  const replace = typeof input.replace === 'string' ? input.replace : '';
  const replaceAll = asBoolean(input.replaceAll, false);

  if (search.length === 0) {
    throw new Error('search must not be empty');
  }

  if (Buffer.byteLength(replace, 'utf8') > maxFileBytes()) {
    throw new Error(`Replacement is too large. MCP_MAX_FILE_BYTES is ${maxFileBytes()}`);
  }

  await ensureWritablePath(targetPath);
  await assertTextFile(targetPath);

  const before = await fs.readFile(targetPath, 'utf8');
  if (!before.includes(search)) {
    throw new Error('Search text was not found');
  }

  const after = replaceAll ? before.split(search).join(replace) : before.replace(search, replace);
  await fs.writeFile(targetPath, after, 'utf8');

  return textResult(JSON.stringify({
    path: relativeProjectPath(targetPath),
    replacements: replaceAll ? before.split(search).length - 1 : 1,
  }, null, 2));
}

async function deleteFile(input: JsonObject): Promise<ToolResult> {
  const targetPath = resolveProjectPath(asString(input.path, 'path'));
  const confirm = asBoolean(input.confirm, false);
  if (!confirm) {
    throw new Error('Set confirm=true to delete a file');
  }

  await ensureWritablePath(targetPath);
  await assertTextFile(targetPath);
  await fs.unlink(targetPath);

  return textResult(JSON.stringify({ deleted: relativeProjectPath(targetPath) }, null, 2));
}

async function searchFiles(input: JsonObject): Promise<ToolResult> {
  const query = asString(input.query, 'query');
  const useRegex = asBoolean(input.regex, false);
  const caseSensitive = asBoolean(input.caseSensitive, false);
  const glob = asOptionalString(input.glob);
  const limit = asNumber(input.limit, DEFAULT_SEARCH_LIMIT, 1, 200);
  const files = await walkFiles(PROJECT_ROOT, 5000);
  const globRegex = glob ? globToRegex(glob) : null;
  const matcher = useRegex ? new RegExp(query, caseSensitive ? 'g' : 'gi') : null;
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: Array<{ path: string; line: number; text: string }> = [];

  for (const file of files) {
    if (matches.length >= limit) {
      break;
    }

    if (globRegex && !globRegex.test(file)) {
      continue;
    }

    const absolutePath = resolveProjectPath(file);
    const ext = path.extname(file).toLowerCase();
    if (ext && !TEXT_EXTENSIONS.has(ext)) {
      continue;
    }

    const stat = await fs.stat(absolutePath);
    if (stat.size > maxFileBytes()) {
      continue;
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const matched = matcher ? matcher.test(line) : (caseSensitive ? line : line.toLowerCase()).includes(needle);
      if (matcher) {
        matcher.lastIndex = 0;
      }

      if (matched) {
        matches.push({ path: file, line: index + 1, text: line.trim().slice(0, 300) });
        if (matches.length >= limit) {
          break;
        }
      }
    }
  }

  return textResult(JSON.stringify({ matches }, null, 2));
}

function cssBlockRegex(selector: ':root' | '.dark'): RegExp {
  const escapedSelector = selector.replace('.', '\\.');
  return new RegExp(`(${escapedSelector}\\s*\\{)([\\s\\S]*?)(\\n\\})`);
}

function parseThemeTokens(css: string, selector: ':root' | '.dark'): Record<string, string> {
  const match = css.match(cssBlockRegex(selector));
  if (!match) {
    throw new Error(`Could not find ${selector} theme block`);
  }

  const tokens: Record<string, string> = {};
  const tokenRegex = /^\s*(--[\w-]+)\s*:\s*([^;]+);/gm;
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokenRegex.exec(match[2])) !== null) {
    tokens[tokenMatch[1]] = tokenMatch[2].trim();
  }

  return tokens;
}

async function getTheme(input: JsonObject): Promise<ToolResult> {
  const mode = input.mode === 'dark' ? 'dark' : 'light';
  const cssPath = resolveProjectPath('src/app/globals.css');
  const css = await fs.readFile(cssPath, 'utf8');
  const selector = mode === 'dark' ? '.dark' : ':root';

  return textResult(JSON.stringify({ mode, tokens: parseThemeTokens(css, selector) }, null, 2));
}

async function updateTheme(input: JsonObject): Promise<ToolResult> {
  const mode = input.mode === 'dark' ? 'dark' : 'light';
  const tokens = asRecord(input.tokens);
  const selector = mode === 'dark' ? '.dark' : ':root';
  const cssPath = resolveProjectPath('src/app/globals.css');
  const css = await fs.readFile(cssPath, 'utf8');
  const blockMatch = css.match(cssBlockRegex(selector));

  if (!blockMatch) {
    throw new Error(`Could not find ${selector} theme block`);
  }

  let block = blockMatch[2];
  const updated: Record<string, string> = {};

  for (const [rawName, rawValue] of Object.entries(tokens)) {
    const name = rawName.startsWith('--') ? rawName : `--${rawName}`;
    if (!/^--[\w-]+$/.test(name)) {
      throw new Error(`Invalid CSS token name: ${rawName}`);
    }

    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      throw new Error(`Token ${name} must be a non-empty string`);
    }

    const value = rawValue.trim();
    const tokenRegex = new RegExp(`(\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*)[^;]+;`);
    if (tokenRegex.test(block)) {
      block = block.replace(tokenRegex, `$1${value};`);
    } else {
      block = `${block}\n  ${name}: ${value};`;
    }
    updated[name] = value;
  }

  const nextCss = css.replace(cssBlockRegex(selector), `$1${block}$3`);
  await fs.writeFile(cssPath, nextCss, 'utf8');

  return textResult(JSON.stringify({ mode, updated }, null, 2));
}

const filePathSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'Project-relative file path.' },
  },
  required: ['path'],
};

export const mcpTools: ToolDefinition[] = [
  {
    name: 'project.list_files',
    description: 'List project files, excluding dependency/build/secret directories.',
    inputSchema: {
      type: 'object',
      properties: {
        glob: { type: 'string', description: 'Optional simple glob such as src/**/*.tsx.' },
        limit: { type: 'number', description: 'Maximum files to return.' },
      },
    },
    handler: listFiles,
  },
  {
    name: 'project.read_file',
    description: 'Read a text file inside the project.',
    inputSchema: filePathSchema,
    handler: readFile,
  },
  {
    name: 'project.write_file',
    description: 'Overwrite or append a text file inside the project.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        mode: { type: 'string', enum: ['overwrite', 'append'] },
        createDirs: { type: 'boolean' },
      },
      required: ['path', 'content'],
    },
    handler: writeFile,
  },
  {
    name: 'project.patch_file',
    description: 'Patch a text file by exact search/replace.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        search: { type: 'string' },
        replace: { type: 'string' },
        replaceAll: { type: 'boolean' },
      },
      required: ['path', 'search', 'replace'],
    },
    handler: patchFile,
  },
  {
    name: 'project.delete_file',
    description: 'Delete a text file inside the project. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['path', 'confirm'],
    },
    handler: deleteFile,
  },
  {
    name: 'project.search',
    description: 'Search text files by plain text or regex.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        regex: { type: 'boolean' },
        caseSensitive: { type: 'boolean' },
        glob: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
    handler: searchFiles,
  },
  {
    name: 'theme.get_tokens',
    description: 'Read CSS theme tokens from src/app/globals.css.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['light', 'dark'] },
      },
    },
    handler: getTheme,
  },
  {
    name: 'theme.update_tokens',
    description: 'Update or add CSS theme tokens in src/app/globals.css.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['light', 'dark'] },
        tokens: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['tokens'],
    },
    handler: updateTheme,
  },
];

export async function executeMcpTool(name: string, input: JsonObject = {}): Promise<ToolResult> {
  const tool = mcpTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.handler(input);
}

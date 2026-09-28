/**
 * Server-side configuration for the external course knowledge base (RAG).
 *
 * Precedence: `knowledge-rag.config.json` (project root, written by the
 * settings UI via /api/knowledge-rag/config) > environment variables
 * (KNOWLEDGE_RAG_URL / KNOWLEDGE_RAG_API_KEY / KNOWLEDGE_RAG_TOP_K).
 *
 * The file is re-read on every resolve, so a save in the settings panel takes
 * effect on the NEXT agent run — no server restart required.
 *
 * File shape:
 *   { "url": "https://…/retrieve", "apiKey": "…", "topK": 5, "updatedAt": "ISO" }
 * An empty/missing `url` means "not configured" (tool hidden from agents).
 */
import fs from 'fs';
import path from 'path';

export interface KnowledgeRagConfig {
  url: string;
  apiKey?: string;
  topK: number;
}

export interface StoredKnowledgeRagConfig extends KnowledgeRagConfig {
  updatedAt?: string;
}

const CONFIG_FILENAME = 'knowledge-rag.config.json';

function configFilePath(): string {
  return path.join(process.cwd(), CONFIG_FILENAME);
}

function clampTopK(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 20 ? parsed : fallback;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function readStoredConfig(): StoredKnowledgeRagConfig | null {
  try {
    const filePath = configFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredKnowledgeRagConfig> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : '';
    if (!url || !isValidHttpUrl(url)) return null;
    return {
      url,
      apiKey: typeof parsed.apiKey === 'string' && parsed.apiKey.trim() ? parsed.apiKey.trim() : undefined,
      topK: clampTopK(parsed.topK, 5),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    // Corrupt file → fall through to env config rather than crashing runs.
    return null;
  }
}

function readEnvConfig(): KnowledgeRagConfig | null {
  const url = process.env.KNOWLEDGE_RAG_URL?.trim();
  if (!url) return null;
  return {
    url,
    apiKey: process.env.KNOWLEDGE_RAG_API_KEY?.trim() || undefined,
    topK: clampTopK(process.env.KNOWLEDGE_RAG_TOP_K, 5),
  };
}

/** Where the active config came from (surfaced in the settings UI). */
export type KnowledgeRagConfigSource = 'file' | 'env' | null;

export function resolveKnowledgeRagConfig(): KnowledgeRagConfig | null {
  return readStoredConfig() ?? readEnvConfig();
}

export function resolveKnowledgeRagConfigSource(): KnowledgeRagConfigSource {
  if (readStoredConfig()) return 'file';
  if (readEnvConfig()) return 'env';
  return null;
}

/**
 * Persist the config from the settings UI. An empty URL clears the config
 * (removes the file) so the tool disappears from agents.
 */
export function writeKnowledgeRagConfig(input: {
  url?: string;
  apiKey?: string;
  topK?: number;
}): { ok: true } | { ok: false; error: string } {
  const url = input.url?.trim() ?? '';

  // Empty URL = clear / disable.
  if (!url) {
    try {
      const filePath = configFilePath();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      return { ok: false, error: `could not remove config file: ${(e as Error).message}` };
    }
    return { ok: true };
  }

  if (!isValidHttpUrl(url)) {
    return { ok: false, error: 'URL must be a valid http(s) address' };
  }

  const stored: StoredKnowledgeRagConfig = {
    url,
    apiKey: input.apiKey?.trim() || undefined,
    topK: clampTopK(input.topK ?? 5, 5),
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(configFilePath(), JSON.stringify(stored, null, 2) + '\n', 'utf-8');
  } catch (e) {
    return { ok: false, error: `could not write config file: ${(e as Error).message}` };
  }
  return { ok: true };
}

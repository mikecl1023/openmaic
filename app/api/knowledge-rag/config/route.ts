import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  resolveKnowledgeRagConfig,
  resolveKnowledgeRagConfigSource,
  writeKnowledgeRagConfig,
} from '@/lib/server/knowledge-rag-config';

export const dynamic = 'force-dynamic';

/** GET: current knowledge-base config (config file > env), for the settings UI. */
export async function GET() {
  const config = resolveKnowledgeRagConfig();
  const source = resolveKnowledgeRagConfigSource();
  return apiSuccess({
    config: config ?? null,
    source,
  });
}

/**
 * POST: persist the config from the settings panel. Body:
 *   { url?: string, apiKey?: string, topK?: number }
 * An empty `url` clears the config (the tool disappears from agents).
 */
export async function POST(req: NextRequest) {
  let body: { url?: unknown; apiKey?: unknown; topK?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'request body must be JSON');
  }

  const url = typeof body.url === 'string' ? body.url : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
  const topKRaw = typeof body.topK === 'number' ? body.topK : undefined;

  const result = writeKnowledgeRagConfig({ url, apiKey, topK: topKRaw });
  if (!result.ok) {
    return apiError('INVALID_URL', 400, result.error);
  }

  const config = resolveKnowledgeRagConfig();
  const source = resolveKnowledgeRagConfigSource();
  return apiSuccess({ config: config ?? null, source, saved: true });
}

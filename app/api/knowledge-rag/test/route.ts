import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveKnowledgeRagConfig } from '@/lib/server/knowledge-rag-config';
import { testKnowledgeRagConnection } from '@/lib/server/agent-runtime/knowledge-rag';

export const dynamic = 'force-dynamic';

/**
 * POST: probe the configured knowledge base with a small query. Body:
 *   { query?: string }
 * Uses the persisted config (file > env); 400 when unconfigured.
 */
export async function POST(req: NextRequest) {
  const config = resolveKnowledgeRagConfig();
  if (!config) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'knowledge base is not configured yet');
  }

  let query = '课程核心概念测试';
  try {
    const body = (await req.json()) as { query?: unknown };
    if (typeof body.query === 'string' && body.query.trim()) query = body.query.trim();
  } catch {
    // no/invalid body → default probe query
  }

  const result = await testKnowledgeRagConnection(config, query);
  if (!result.ok) {
    return apiSuccess({ ok: false, error: result.error });
  }
  return apiSuccess({ ok: true, hits: result.hits, preview: result.preview });
}

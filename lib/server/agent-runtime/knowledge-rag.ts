/**
 * `knowledge_rag` for the agent runtime — capability-registered, mirroring
 * `web_search` exactly.
 *
 * The tool is registered ONLY when this deployment has a configured external
 * knowledge base (KNOWLEDGE_RAG_URL set). An unconfigured deployment simply
 * does not register the tool — the only form of "unavailable" a model cannot
 * misread. Config lives in .env:
 *
 *   KNOWLEDGE_RAG_URL        (required)  Your external RAG / vector search
 *                                        service's retrieval endpoint (POST).
 *   KNOWLEDGE_RAG_API_KEY    (optional)  Sent as `Authorization: Bearer <key>`.
 *   KNOWLEDGE_RAG_TOP_K      (optional)  Default top-k hits to return (default 5).
 *
 * Request contract sent to KNOWLEDGE_RAG_URL (JSON POST):
 *   { "query": "<course-language query>", "top_k": <int> }
 *
 * Expected response (JSON) — both shapes are accepted:
 *   { "results": [ { "text": "...", "score"?: 0..1, "source"?: "...", "title"?: "..." } ] }
 *   { "data":    [ { "text": "...", "score"?: 0..1, "source"?: "...", "title"?: "..." } ] }
 *
 * If your service differs, adapt `fetchKnowledge` below (or put a tiny
 * conforming proxy in front of it).
 */
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { resolveKnowledgeRagConfig } from '@/lib/server/knowledge-rag-config';

export interface KnowledgeRagCapability {
  url: string;
  apiKey?: string;
  topK: number;
}

/**
 * This deployment's external-KB capability, or null when unconfigured.
 * Reads `knowledge-rag.config.json` (settings UI) with .env fallback — re-read
 * on every call, so UI saves take effect on the next agent run.
 */
export function resolveKnowledgeRagCapability(): KnowledgeRagCapability | null {
  return resolveKnowledgeRagConfig();
}

interface RagHit {
  text: string;
  score?: number;
  source?: string;
  title?: string;
}

/**
 * Query the external knowledge base. Returns normalized hits, or null when the
 * call itself failed (so the tool can report failure as text to the model).
 * The abort signal is carried into fetch so in-flight work is cut short.
 */
async function fetchKnowledge(
  cap: KnowledgeRagCapability,
  query: string,
  topK: number,
  signal?: AbortSignal,
): Promise<RagHit[] | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cap.apiKey) headers['Authorization'] = `Bearer ${cap.apiKey}`;

  const res = await fetch(cap.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, top_k: topK }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    throw new Error(`knowledge base returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  const raw: unknown = Array.isArray(body)
    ? body
    : (body as { results?: unknown; data?: unknown })?.results ??
      (body as { results?: unknown; data?: unknown })?.data;

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): RagHit | null => {
      if (typeof item === 'string') return { text: item };
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const text = o.text ?? o.content ?? o.chunk;
        if (typeof text !== 'string' || !text.trim()) return null;
        const score = typeof o.score === 'number' ? o.score : undefined;
        const source = typeof o.source === 'string' ? o.source : undefined;
        const title = typeof o.title === 'string' ? o.title : undefined;
        return { text, score, source, title };
      }
      return null;
    })
    .filter((x): x is RagHit => x !== null);
}

/**
 * One-off connectivity probe used by the settings panel's "test connection"
 * button. Returns a normalized summary instead of raw hits.
 */
export async function testKnowledgeRagConnection(
  cap: KnowledgeRagCapability,
  query: string,
): Promise<{ ok: true; hits: number; preview: string[] } | { ok: false; error: string }> {
  try {
    const hits = await fetchKnowledge(cap, query, cap.topK);
    if (!hits) return { ok: false, error: 'service returned an unreadable response body' };
    return {
      ok: true,
      hits: hits.length,
      preview: hits.slice(0, 3).map((h) => (h.title ? `${h.title}: ${h.text}` : h.text).slice(0, 120)),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const RAG_SCHEMA = Type.Object({
  query: Type.String({
    description: 'The knowledge-base query, in the language of the course.',
  }),
  topK: Type.Optional(
    Type.Integer({ description: 'Optional number of chunks to retrieve (1-20).', minimum: 1, maximum: 20 }),
  ),
});

export function buildKnowledgeRagTool(capability: KnowledgeRagCapability): AgentTool<never, never> {
  const tool: AgentTool<typeof RAG_SCHEMA, unknown> = {
    name: 'knowledge_rag',
    label: 'Query course knowledge base',
    description:
      'Search the course\'s knowledge base (authoritative source material) for the topic being taught. ' +
      'Use it when the lesson includes facts, terminology, examples, or content that a specific textbook, ' +
      'syllabus, or provided reference covers — prefer it over guessing. ' +
      'Pick a precise query; the service returns the most relevant chunks from the source material.',
    parameters: RAG_SCHEMA,
    async execute(_id, params: Static<typeof RAG_SCHEMA>, signal) {
      if (signal?.aborted) throw new Error('aborted');
      const topK = params.topK ?? capability.topK;
      let hits: RagHit[] | null;
      try {
        hits = await fetchKnowledge(capability, params.query, topK, signal);
      } catch (e) {
        return {
          content: [
            {
              type: 'text',
              text: `[knowledge_rag] could not reach the knowledge base: ${(e as Error).message}`,
            },
          ],
          details: { query: params.query, error: true },
        };
      }
      if (signal?.aborted) throw new Error('aborted');

      if (!hits || hits.length === 0) {
        return {
          content: [{ type: 'text', text: `No knowledge-base results for "${params.query}".` }],
          details: { query: params.query, hits: 0 },
        };
      }

      const block = hits
        .map((h, i) => {
          const head = h.title ? `[${i + 1}] ${h.title}${h.score != null ? ` (score ${h.score.toFixed(2)})` : ''}` : `[${i + 1}]`;
          const src = h.source ? `\nSource: ${h.source}` : '';
          return `${head}\n${h.text}${src}`;
        })
        .join('\n\n---\n\n');

      return {
        content: [{ type: 'text', text: block }],
        details: { query: params.query, hits: hits.length },
      };
    },
  };
  return tool as unknown as AgentTool<never, never>;
}

/**
 * The prompt block, present exactly when the tool is. Guidance on WHEN to use
 * the knowledge base, not a report that somebody asked for it.
 */
export function knowledgeRagPromptBlock(): string {
  return [
    '## Course knowledge base',
    '',
    'You have `knowledge_rag`. Before teaching facts, terminology, rules, or examples that the course source',
    'material covers, call it to ground your content in the authoritative material. Prefer one precise query',
    'over several vague ones; follow up if the first pass misses the specific point. Cite the retrieved',
    'content naturally in the lesson — do not dump raw chunks at the learner.',
  ].join('\n');
}

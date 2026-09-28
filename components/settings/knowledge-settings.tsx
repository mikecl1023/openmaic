'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import { BookOpen, CheckCircle2, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';

interface KnowledgeRagConfig {
  url: string;
  apiKey?: string;
  topK: number;
}

type ConfigSource = 'file' | 'env' | null;

interface TestResult {
  ok: boolean;
  hits?: number;
  preview?: string[];
  error?: string;
}

/**
 * Settings panel section for the external course knowledge base (RAG).
 * Persists to the server-side `knowledge-rag.config.json` via
 * /api/knowledge-rag/config — takes effect on the next agent run.
 */
export function KnowledgeSettings() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [source, setSource] = useState<ConfigSource>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [topK, setTopK] = useState('5');
  const [testQuery, setTestQuery] = useState('');

  // Guard against setState-after-unmount on the initial fetch.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/knowledge-rag/config');
      const body = (await res.json()) as {
        success?: boolean;
        config?: KnowledgeRagConfig | null;
        source?: ConfigSource;
      };
      if (body.config) {
        setUrl(body.config.url || '');
        setApiKey(body.config.apiKey || '');
        setTopK(String(body.config.topK ?? 5));
      } else {
        setUrl('');
        setApiKey('');
        setTopK('5');
      }
      setSource(body.source ?? null);
    } catch {
      toast.error(t('settings.knowledgeLoadFailed'));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/knowledge-rag/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, apiKey, topK: Number.parseInt(topK, 10) || 5 }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        error?: string;
        source?: ConfigSource;
      };
      if (!res.ok || !body.success) {
        toast.error(body.error || t('settings.knowledgeSaveFailed'));
        return;
      }
      setSource(body.source ?? null);
      toast.success(t('settings.knowledgeSaved'));
    } catch {
      toast.error(t('settings.knowledgeSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/knowledge-rag/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testQuery || undefined }),
      });
      const body = (await res.json()) as TestResult & { success?: boolean; error?: string };
      if (!res.ok) {
        setTestResult({ ok: false, error: body.error || `HTTP ${res.status}` });
        return;
      }
      setTestResult(body);
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <BookOpen className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {t('settings.knowledgeDescription')}
          </p>
          <p className="text-xs text-muted-foreground">
            {source === 'file' && t('settings.knowledgeSourceFile')}
            {source === 'env' && t('settings.knowledgeSourceEnv')}
            {source === null && t('settings.knowledgeSourceNone')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('settings.knowledgeLoading')}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-sm">{t('settings.knowledgeUrl')}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-rag-service/v1/retrieve"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{t('settings.knowledgeUrlHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">{t('settings.knowledgeApiKey')}</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('settings.knowledgeApiKeyPlaceholder')}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t('settings.knowledgeApiKeyHint')}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t('settings.knowledgeTopK')}</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(e.target.value)}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">{t('settings.knowledgeTopKHint')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{t('settings.knowledgeTestQuery')}</Label>
            <div className="flex gap-2">
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder={t('settings.knowledgeTestQueryPlaceholder')}
                className="text-sm"
              />
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !url}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('settings.knowledgeTest')}
              </Button>
            </div>

            {testResult && (
              <div
                className={
                  testResult.ok
                    ? 'rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300 space-y-1'
                    : 'rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300'
                }
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testResult.ok
                    ? t('settings.knowledgeTestOk').replace('{n}', String(testResult.hits ?? 0))
                    : t('settings.knowledgeTestFail')}
                </div>
                {testResult.ok && testResult.preview && testResult.preview.length > 0 && (
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {testResult.preview.map((p, i) => (
                      <li key={i} className="break-all">
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {!testResult.ok && testResult.error && (
                  <p className="text-xs break-all">{testResult.error}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('settings.knowledgeSave')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

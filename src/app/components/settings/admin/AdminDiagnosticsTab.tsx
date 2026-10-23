import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle, CheckCircle2, AlertTriangle, Loader2, Mail, Activity, Trash2,
} from 'lucide-react';
import { PageHeader, PageAction } from '../../base/PageHeader';
import { apiRequest } from '../../../utils/api';
import { getApiBaseUrl } from '../../../utils/api-client';
import { toast } from 'sonner';
import { getLocale } from '../../../utils/format';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

interface DiagnosticReport {
  timestamp: string;
  overall: 'ok' | 'warn' | 'error';
  checks: CheckResult[];
  totalUsers: number;
  environment: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  ok:    <CheckCircle2  className="w-4 h-4 text-green-500 flex-shrink-0" />,
  warn:  <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />,
  error: <AlertCircle   className="w-4 h-4 text-red-500 flex-shrink-0" />,
};

const STATUS_ROW_BG: Record<string, string> = {
  ok:    '',
  warn:  'bg-yellow-500/5 border-l-2 border-yellow-500',
  error: 'bg-red-500/5 border-l-2 border-red-500',
};

const OVERALL_BADGE: Record<string, string> = {
  ok:    'bg-green-500/10 text-green-400 border border-green-500/30',
  warn:  'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
  error: 'bg-red-500/10 text-red-400 border border-red-500/30',
};

function formatCheckName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export const AdminDiagnosticsTab: React.FC = () => {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [cleaningSessions, setCleaningSessions] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const base = getApiBaseUrl() || 'http://localhost:4000';
      const token = localStorage.getItem('leadflow_access_token');
      const res = await fetch(`${base}/api/diagnostics`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // 200 = ok, 207 = warn, 503 = error — all return JSON report
      if (res.status === 401 || res.status === 403) {
        setFetchError('Acesso negado. Apenas administradores podem ver o diagnóstico.');
        return;
      }
      const data = (await res.json()) as DiagnosticReport;
      setReport(data);
    } catch (e: any) {
      setFetchError(e?.message || 'Falha ao carregar diagnóstico');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDiagnostics();
  }, [fetchDiagnostics]);

  const cleanSessions = async () => {
    setCleaningSessions(true);
    try {
      const base = getApiBaseUrl() || 'http://localhost:4000';
      const token = localStorage.getItem('leadflow_access_token');
      const res = await fetch(`${base}/api/diagnostics/cleanup-sessions`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      toast.success(` ${data.deletedSessions} sessões expiradas removidas`);
      void fetchDiagnostics();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao limpar sessões');
    } finally {
      setCleaningSessions(false);
    }
  };

  const sendTestAlert = async () => {
    setTestingAlert(true);
    try {
      await apiRequest('/api/diagnostics/test-alert', 'POST');
      toast.success('Email de alerta de teste enviado!');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar alerta de teste');
    } finally {
      setTestingAlert(false);
    }
  };

  const problems = report?.checks.filter(c => c.status !== 'ok') ?? [];
  const sessionsProblematic = report?.checks.some(c => c.name === 'sessions' && c.status !== 'ok') ?? false;
  const sorted = report
    ? [...report.checks].sort((a, b) => {
        const order = { error: 0, warn: 1, ok: 2 };
        return order[a.status] - order[b.status];
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Diagnóstico do Sistema"
        description="Saúde em tempo real de todos os serviços"
        icon={Activity}
        actions={
          <>
            {sessionsProblematic && (
              <PageAction
                icon={cleaningSessions ? Loader2 : Trash2}
                label="Limpar sessões expiradas"
                onClick={() => void cleanSessions()}
                disabled={cleaningSessions || loading}
                className={`border-yellow-500/50 text-yellow-600 ${cleaningSessions ? '[&>svg]:animate-spin' : ''}`}
              />
            )}
            <PageAction
              icon={testingAlert ? Loader2 : Mail}
              label="Testar alerta por email"
              onClick={() => void sendTestAlert()}
              disabled={testingAlert || loading}
              className={testingAlert ? '[&>svg]:animate-spin' : undefined}
            />
          </>
        }
      />

      {/* Loading state */}
      {loading && !report && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>A verificar serviços...</span>
        </div>
      )}

      {/* Error state */}
      {fetchError && !loading && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Overall status card */}
          <div className={`rounded-xl border p-5 flex items-center justify-between ${
            report.overall === 'ok'
              ? 'bg-green-500/5 border-green-500/30'
              : report.overall === 'warn'
              ? 'bg-yellow-500/5 border-yellow-500/30'
              : 'bg-red-500/5 border-red-500/30'
          }`}>
            <div className="flex items-center gap-4">
              {report.overall === 'ok'  && <CheckCircle2  className="w-8 h-8 text-green-500" />}
              {report.overall === 'warn' && <AlertTriangle className="w-8 h-8 text-yellow-500" />}
              {report.overall === 'error' && <AlertCircle  className="w-8 h-8 text-red-500" />}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    {report.overall === 'ok'    && 'Todos os sistemas operacionais'}
                    {report.overall === 'warn'   && `${problems.length} aviso${problems.length > 1 ? 's' : ''} detectado${problems.length > 1 ? 's' : ''}`}
                    {report.overall === 'error'  && `${problems.length} problema${problems.length > 1 ? 's' : ''} crítico${problems.length > 1 ? 's' : ''}`}
                  </span>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${OVERALL_BADGE[report.overall]}`}>
                    {report.overall.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {report.totalUsers} utilizadores · ambiente {report.environment} ·{' '}
                  {new Date(report.timestamp).toLocaleString(getLocale())}
                </p>
              </div>
            </div>
          </div>

          {/* Problems summary */}
          {problems.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                Problemas que requerem atenção
              </h2>
              <div className="space-y-2">
                {problems.map(p => (
                  <div key={p.name} className="flex items-start gap-3 text-sm">
                    {STATUS_ICON[p.status]}
                    <div>
                      <span className="font-medium text-foreground">{formatCheckName(p.name)}</span>
                      <span className="text-muted-foreground mx-1">—</span>
                      <span className="text-muted-foreground">{p.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full check list */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Estado completo ({report.checks.length} verificações)
              </h2>
            </div>
            <div className="divide-y divide-border">
              {sorted.map(check => (
                <div key={check.name} className={STATUS_ROW_BG[check.status]}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setExpandedCheck(expandedCheck === check.name ? null : check.name)}
                  >
                    {STATUS_ICON[check.status]}
                    <span className="font-medium text-foreground w-40 shrink-0">{formatCheckName(check.name)}</span>
                    <span className="text-muted-foreground flex-1">{check.message}</span>
                    {check.details && (
                      <span className="text-xs text-muted-foreground/60 ml-2">
                        {expandedCheck === check.name ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                  {expandedCheck === check.name && check.details && (
                    <div className="px-5 pb-3 ml-7">
                      <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto text-muted-foreground">
                        {JSON.stringify(check.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

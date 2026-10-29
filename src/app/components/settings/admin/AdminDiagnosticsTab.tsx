import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle, CheckCircle2, AlertTriangle, Activity, Mail, Trash2, RefreshCw, ChevronDown,
} from 'lucide-react';
import { PageHeader, PageAction } from '../../base/PageHeader';
import { ErrorState } from '../../base/ErrorState';
import { LoadingState } from '../../base/LoadingState';
import { Button } from '../../ui/button';
import { apiRequest } from '../../../utils/api';
import { getApiBaseUrl } from '../../../utils/api-client';
import { toast } from 'sonner';
import { formatDateTime } from '../../../utils/format';

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

const STATUS_ICON: Record<CheckResult['status'], React.ReactNode> = {
  ok:    <CheckCircle2  className="w-4 h-4 text-green-500 flex-shrink-0" />,
  warn:  <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />,
  error: <AlertCircle   className="w-4 h-4 text-red-500 flex-shrink-0" />,
};

/** Nomes legíveis das verificações da API */
const CHECK_LABELS: Record<string, string> = {
  database: 'Base de dados',
  database_tables: 'Tabelas',
  jwt: 'Tokens de sessão',
  google_oauth: 'Login com Google',
  oauth_encoding: 'Dados do login',
  smtp: 'Email (SMTP)',
  evolution_api: 'WhatsApp por QR',
  minio_storage: 'Armazenamento de ficheiros',
  frontend_url: 'Endereço do app',
  sessions: 'Sessões guardadas',
  users: 'Utilizadores',
  auth_metrics: 'Logins',
  memory: 'Memória',
};

const checkLabel = (name: string) =>
  CHECK_LABELS[name] ?? name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const ORDER = { error: 0, warn: 1, ok: 2 };
const sectionTitle = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('leadflow_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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
      const res = await fetch(`${base}/api/diagnostics`, { headers: authHeaders() });
      // 200 = ok, 207 = warn, 503 = error — all return JSON report
      if (res.status === 401 || res.status === 403) {
        setFetchError('Só administradores podem ver o diagnóstico.');
        return;
      }
      setReport((await res.json()) as DiagnosticReport);
    } catch (e: any) {
      setFetchError(e?.message || 'Não foi possível carregar o diagnóstico');
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
      const res = await fetch(`${base}/api/diagnostics/cleanup-sessions`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      toast.success(`${data.deletedSessions} sessões expiradas removidas`);
      void fetchDiagnostics();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível limpar as sessões');
    } finally {
      setCleaningSessions(false);
    }
  };

  const sendTestAlert = async () => {
    setTestingAlert(true);
    try {
      const res = await apiRequest('/api/diagnostics/test-alert', 'POST');
      toast.success(res?.sentTo ? `Relatório enviado para ${res.sentTo}` : 'Relatório enviado por email');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar o email');
    } finally {
      setTestingAlert(false);
    }
  };

  const problems = report?.checks.filter((c) => c.status !== 'ok') ?? [];
  const sessionsProblematic = report?.checks.some((c) => c.name === 'sessions' && c.status !== 'ok') ?? false;
  const sorted = report ? [...report.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : [];
  const errors = problems.filter((c) => c.status === 'error').length;
  const warnings = problems.length - errors;

  const summary = !report
    ? ''
    : problems.length === 0
      ? 'Tudo a funcionar'
      : [
          errors > 0 ? (errors === 1 ? '1 problema' : `${errors} problemas`) : '',
          warnings > 0 ? (warnings === 1 ? '1 aviso' : `${warnings} avisos`) : '',
        ].filter(Boolean).join(' · ');

  return (
    <div>
      <PageHeader
        title="Diagnóstico"
        icon={Activity}
        actions={
          <>
            {sessionsProblematic && (
              <PageAction
                icon={Trash2}
                label="Limpar sessões expiradas"
                onClick={() => void cleanSessions()}
                disabled={cleaningSessions || loading}
              />
            )}
            <PageAction
              icon={Mail}
              label="Enviar relatório por email"
              onClick={() => void sendTestAlert()}
              disabled={testingAlert || loading}
            />
            <PageAction
              icon={RefreshCw}
              label="Atualizar"
              onClick={() => void fetchDiagnostics()}
              disabled={loading}
              className={loading ? '[&>svg]:animate-spin' : undefined}
            />
          </>
        }
      />

      {loading && !report && <LoadingState />}

      {fetchError && !loading && !report && (
        <ErrorState
          description={fetchError}
          action={<Button variant="outline" onClick={() => void fetchDiagnostics()}>Tentar de novo</Button>}
        />
      )}

      {report && (
        <div className="max-w-3xl space-y-8">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4">
            {STATUS_ICON[report.overall]}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{summary}</p>
              <p className="text-xs text-muted-foreground">
                <span translate="no">{report.totalUsers}</span> utilizadores · <span translate="no">{report.environment}</span> · {formatDateTime(report.timestamp)}
              </p>
            </div>
          </div>

          <section>
            <h3 className={sectionTitle}>Verificações</h3>
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {sorted.map((check) => {
                const open = expandedCheck === check.name;
                const expandable = !!check.details && Object.keys(check.details).length > 0;
                return (
                  <div key={check.name}>
                    <button
                      type="button"
                      disabled={!expandable}
                      onClick={() => setExpandedCheck(open ? null : check.name)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-muted/40"
                    >
                      <span className="mt-0.5">{STATUS_ICON[check.status]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{checkLabel(check.name)}</span>
                        <span className="block text-xs text-muted-foreground break-words" translate="no">{check.message}</span>
                      </span>
                      {expandable && (
                        <ChevronDown className={`mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                    {open && expandable && (
                      <pre className="mx-4 mb-3 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground" translate="no">
                        {JSON.stringify(check.details, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

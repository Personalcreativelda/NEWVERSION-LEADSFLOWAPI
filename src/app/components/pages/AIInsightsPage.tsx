import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain, RefreshCw, Flame, TrendingDown, TrendingUp, Star,
  Sparkles, CheckCircle2, Calendar, Target, MessageSquare, Mail,
  Zap, AlertCircle, ArrowRight, Lightbulb, Activity, Copy, Send,
  ChevronDown, ChevronUp, Edit3, X
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

interface AIInsightsStats {
  hot_count: number;
  high_risk_count: number;
  avg_engagement: number;
  avg_conversion: number;
}

interface LeadInsight {
  id: string;
  name: string;
  status: string;
  engagement_score: number;
  conversion_probability: number;
  risk_level?: 'high' | 'medium' | 'low';
  next_best_action?: string;
  recommended_channel?: string;
  last_contact_at?: string;
}

interface Insights {
  stats: AIInsightsStats;
  hotLeads: LeadInsight[];
  atRiskLeads: LeadInsight[];
  recommendedActions: LeadInsight[];
}

interface MessageState {
  leadId: string;
  suggestions: string[];
  selectedIndex: number;
  isExpanded: boolean;
  editedContent?: string;
}

interface SendingState {
  leadId: string;
  isSending: boolean;
  sentAt?: Date;
}

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, MessageState>>({});
  const [sendingStates, setSendingStates] = useState<Record<string, SendingState>>({});
  const [editingMessage, setEditingMessage] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.aiRemarketing.insights();
      if (data) {
        setInsights(data);
      }
    } catch (err) {
      console.error('Error loading insights:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const handleAnalyzeLeads = async () => {
    try {
      setAnalyzing(true);
      const res = await api.aiRemarketing.analyze();
      if (res) {
        await loadInsights();
        toast.success('Leads analisados com sucesso!');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao analisar leads');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateMessage = async (lead: LeadInsight) => {
    try {
      setGeneratingFor(lead.id);
      // Gerar 3 mensagens diferentes
      const suggestions: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await api.aiRemarketing.generateMessage({
          leadId: lead.id,
          tone: i === 0 ? 'friendly' : i === 1 ? 'professional' : 'urgent',
          goal: 'follow-up',
          channel: lead.recommended_channel || 'whatsapp'
        });
        if (res?.suggestions?.[0]) {
          suggestions.push(res.suggestions[0]);
        }
      }
      
      if (suggestions.length > 0) {
        setMessages(prev => ({
          ...prev,
          [lead.id]: {
            leadId: lead.id,
            suggestions,
            selectedIndex: 0,
            isExpanded: true
          }
        }));
        toast.success(`${suggestions.length} mensagens geradas! Escolha uma ou edite.`);
      } else {
        toast.error('Erro ao gerar mensagens, tente novamente.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao gerar mensagens');
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleCopyMessage = async (leadId: string) => {
    const message = messages[leadId];
    if (message) {
      const contentToCopy = message.editedContent || message.suggestions[message.selectedIndex];
      await navigator.clipboard.writeText(contentToCopy);
      toast.success('✓ Copiado para área de transferência');
    }
  };

  const handleSendMessage = async (lead: LeadInsight) => {
    const message = messages[lead.id];
    if (!message?.suggestions?.length) {
      toast.error('Nenhuma mensagem para enviar');
      return;
    }

    const contentToSend = message.editedContent || message.suggestions[message.selectedIndex];

    try {
      setSendingStates(prev => ({
        ...prev,
        [lead.id]: { leadId: lead.id, isSending: true }
      }));

      // Enviar mensagem de verdade via API
      const res = await api.aiRemarketing.sendMessage({
        leadId: lead.id,
        content: contentToSend,
        channel: lead.recommended_channel || 'whatsapp'
      });
      
      if (res?.success) {
        setSendingStates(prev => ({
          ...prev,
          [lead.id]: { leadId: lead.id, isSending: false, sentAt: new Date() }
        }));

        toast.success(`✓ Mensagem enviada para ${lead.name} com sucesso!`);
        
        // Limpar estado após 3 segundos
        setTimeout(() => {
          setSendingStates(prev => {
            const newState = { ...prev };
            delete newState[lead.id];
            return newState;
          });
          // Limpar mensagens após envio bem-sucedido
          setMessages(prev => {
            const newState = { ...prev };
            delete newState[lead.id];
            return newState;
          });
        }, 3000);
      } else {
        toast.error('Erro ao enviar mensagem');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao enviar mensagem. Tente novamente.');
      setSendingStates(prev => ({
        ...prev,
        [lead.id]: { leadId: lead.id, isSending: false }
      }));
    }
  };

  const toggleMessageExpand = (leadId: string) => {
    setMessages(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        isExpanded: !prev[leadId]?.isExpanded
      }
    }));
  };

  const handleSelectSuggestion = (leadId: string, index: number) => {
    setMessages(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        selectedIndex: index,
        editedContent: undefined
      }
    }));
  };

  const handleEditMessage = (leadId: string) => {
    setEditingMessage(editingMessage === leadId ? null : leadId);
  };

  const handleSaveEdit = (leadId: string, newContent: string) => {
    if (newContent.trim()) {
      setMessages(prev => ({
        ...prev,
        [leadId]: {
          ...prev[leadId],
          editedContent: newContent
        }
      }));
      setEditingMessage(null);
      toast.success('Mensagem atualizada!');
    }
  };

  const getRiskDescription = (lead: LeadInsight, days?: number) => {
    if (lead.risk_level === 'high') {
      return days === 0 ? 'Sem contato hoje' : `Sem resposta há ${days} dia${days !== 1 ? 's' : ''}`;
    }
    return `Engajamento: ${lead.engagement_score}%`;
  };

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Motor de Vendas</h1>
              <p className="text-xs text-muted-foreground">Decisões inteligentes para seus leads</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleAnalyzeLeads}
            disabled={analyzing}
          >
            {analyzing
              ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />
            }
            {analyzing ? 'Analisando...' : 'Reanalisar'}
          </Button>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Analisando seus leads com IA...</p>
            </div>
          </div>
        ) : insights ? (
          <>
            {/* AI Decision Summary */}
            <div className="bg-gradient-to-r from-purple-600/10 to-indigo-600/10 border border-purple-200/30 dark:border-purple-800/30 rounded-xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Lightbulb className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-foreground mb-1">Decisões da IA</h2>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {insights.stats.hot_count > 0
                      ? `🔥 ${insights.stats.hot_count} lead${insights.stats.hot_count > 1 ? 's' : ''} com alto potencial pronto para converter. `
                      : ''}
                    {insights.stats.high_risk_count > 0
                      ? `⚠️ ${insights.stats.high_risk_count} em risco que precisa intervenção imediata. `
                      : ''}
                    Conversão prevista: <span className="font-bold text-emerald-600">+{insights.stats.avg_conversion || 15}%</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Leads Quentes', value: insights.stats.hot_count ?? 0, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                { label: 'Críticos', value: insights.stats.high_risk_count ?? 0, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
                { label: 'Engajamento', value: `↑${insights.stats.avg_engagement ?? 0}%`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Conversão', value: `↑${insights.stats.avg_conversion ?? 0}%`, icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
                  </div>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Priority Leads with Message Preview */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-foreground">Ações Prioritárias</h3>
                <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-full font-semibold">
                  {(insights.hotLeads?.length || 0) + (insights.atRiskLeads?.length || 0)} leads aguardando
                </span>
              </div>

              {/* Hot Leads - Priority 1 */}
              {insights.hotLeads?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                    🎯 Prioridade 1: Conversão Iminente
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insights.hotLeads.map((lead: any) => (
                      <div key={lead.id} className="bg-gradient-to-br from-emerald-50/50 to-emerald-50/20 dark:from-emerald-950/20 dark:to-emerald-950/5 border-2 border-emerald-200/50 dark:border-emerald-800/30 rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-foreground truncate">{lead.name}</span>
                              <span className="text-xs font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {lead.conversion_probability}% chance
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground capitalize">{lead.status}</p>
                          </div>
                          <div className="flex items-center gap-1 text-emerald-600 font-bold">
                            <TrendingUp className="w-4 h-4" />
                            {lead.engagement_score}
                          </div>
                        </div>

                        {/* AI Recommendation */}
                        {lead.next_best_action && (
                          <div className="bg-white/50 dark:bg-black/20 rounded border border-emerald-200/30 dark:border-emerald-800/30 p-2.5">
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Por que é prioritário:</p>
                            <p className="text-xs text-foreground/80">{lead.next_best_action}</p>
                          </div>
                        )}

                        {/* Message Preview */}
                        {messages[lead.id] ? (
                          <div className="bg-white/30 dark:bg-black/30 rounded-lg border border-emerald-200/50 dark:border-emerald-800/50 p-3 space-y-2">
                            {/* Suggestion Selector */}
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-foreground">3 Mensagens Sugeridas</p>
                              <div className="space-y-1.5">
                                {messages[lead.id]?.suggestions.map((suggestion, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleSelectSuggestion(lead.id, idx)}
                                    className={`w-full text-left p-2 rounded border text-xs transition-all ${
                                      messages[lead.id]?.selectedIndex === idx
                                        ? 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600'
                                        : 'bg-white/20 dark:bg-black/20 border-emerald-200/30 dark:border-emerald-800/30 hover:bg-white/30'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className={`text-xs font-bold flex-shrink-0 ${
                                        messages[lead.id]?.selectedIndex === idx 
                                          ? 'text-emerald-600 dark:text-emerald-400' 
                                          : 'text-muted-foreground'
                                      }`}>
                                        {idx + 1}.
                                      </span>
                                      <span className="line-clamp-2 text-foreground/80">{suggestion}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Edit Mode */}
                            {editingMessage === lead.id ? (
                              <div className="space-y-2 bg-white/20 dark:bg-black/40 p-2.5 rounded border border-emerald-200/50 dark:border-emerald-800/50">
                                <p className="text-xs font-bold text-foreground">Editar Mensagem</p>
                                <textarea
                                  defaultValue={messages[lead.id]?.editedContent || messages[lead.id]?.suggestions[messages[lead.id]?.selectedIndex]}
                                  onChange={(e) => {
                                    const newContent = e.target.value;
                                    if (newContent) {
                                      setMessages(prev => ({
                                        ...prev,
                                        [lead.id]: {
                                          ...prev[lead.id],
                                          editedContent: newContent
                                        }
                                      }));
                                    }
                                  }}
                                  className="w-full h-24 p-2 bg-white/50 dark:bg-black/40 text-foreground text-xs rounded border border-emerald-200/30 dark:border-emerald-800/30 resize-none focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                                  placeholder="Edite a mensagem conforme necessário..."
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => {
                                      const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
                                      handleSaveEdit(lead.id, textarea?.value || '');
                                    }}
                                  >
                                    Salvar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-7 text-xs"
                                    onClick={() => {
                                      setEditingMessage(null);
                                      setMessages(prev => ({
                                        ...prev,
                                        [lead.id]: {
                                          ...prev[lead.id],
                                          editedContent: undefined
                                        }
                                      }));
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-foreground">Mensagem Selecionada</p>
                                  <button
                                    onClick={() => toggleMessageExpand(lead.id)}
                                    className="text-emerald-600 hover:text-emerald-700 transition-colors"
                                  >
                                    {messages[lead.id]?.isExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>

                                {messages[lead.id]?.isExpanded ? (
                                  <div className="max-h-48 overflow-y-auto">
                                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words bg-white/20 dark:bg-black/20 p-2 rounded">
                                      {messages[lead.id]?.editedContent || messages[lead.id]?.suggestions[messages[lead.id]?.selectedIndex]}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-xs text-foreground/80 line-clamp-3 bg-white/20 dark:bg-black/20 p-2 rounded">
                                    {messages[lead.id]?.editedContent || messages[lead.id]?.suggestions[messages[lead.id]?.selectedIndex]}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Message Action Buttons */}
                            {editingMessage !== lead.id && (
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  className="flex-1 h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                  onClick={() => handleSendMessage(lead)}
                                  disabled={sendingStates[lead.id]?.isSending}
                                >
                                  {sendingStates[lead.id]?.isSending ? (
                                    <>
                                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      Enviando...
                                    </>
                                  ) : sendingStates[lead.id]?.sentAt ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Enviado
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-3.5 h-3.5" />
                                      Enviar
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 px-2"
                                  onClick={() => handleCopyMessage(lead.id)}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 px-2"
                                  onClick={() => handleEditMessage(lead.id)}
                                >
                                  <Edit3 className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full gap-1.5 h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleGenerateMessage(lead)}
                            disabled={generatingFor === lead.id}
                          >
                            {generatingFor === lead.id
                              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : <Sparkles className="w-3.5 h-3.5" />
                            }
                            {generatingFor === lead.id ? 'Gerando...' : 'Gerar Mensagem'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* At-Risk Leads - Priority 2 */}
              {insights.atRiskLeads?.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                    ⚠️ Prioridade 2: Risco de Perda
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insights.atRiskLeads.map((lead: any) => {
                      const days = lead.last_contact_at
                        ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / 86400000)
                        : null;
                      return (
                        <div key={lead.id} className="bg-gradient-to-br from-red-50/50 to-red-50/20 dark:from-red-950/20 dark:to-red-950/5 border-2 border-red-200/50 dark:border-red-800/30 rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-foreground truncate">{lead.name}</span>
                                <span className="text-xs font-bold bg-red-500/20 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  {lead.risk_level === 'high' ? 'Crítico' : 'Médio'}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground capitalize">{lead.status}</p>
                            </div>
                            <div className="flex items-center gap-1 text-red-600 font-bold">
                              <AlertCircle className="w-4 h-4" />
                              {lead.engagement_score}
                            </div>
                          </div>

                          {/* Risk Details */}
                          {days !== null && (
                            <div className="text-xs text-red-600 dark:text-red-400 font-semibold bg-red-50/50 dark:bg-red-950/30 p-2 rounded border border-red-200/30 dark:border-red-800/30">
                              ⏰ {days === 0 ? 'Sem contato hoje!' : `Sem resposta há ${days} dia${days !== 1 ? 's' : ''}`}
                            </div>
                          )}

                          {/* AI Recommendation */}
                          {lead.next_best_action && (
                            <div className="bg-white/50 dark:bg-black/20 rounded border border-red-200/30 dark:border-red-800/30 p-2.5">
                              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Ação recomendada:</p>
                              <p className="text-xs text-foreground/80">{lead.next_best_action}</p>
                            </div>
                          )}

                          {/* Message Preview */}
                          {messages[lead.id] ? (
                            <div className="bg-white/30 dark:bg-black/30 rounded-lg border border-red-200/50 dark:border-red-800/50 p-3 space-y-2">
                              {/* Suggestion Selector */}
                              <div className="space-y-2">
                                <p className="text-xs font-bold text-foreground">3 Mensagens Sugeridas</p>
                                <div className="space-y-1.5">
                                  {messages[lead.id]?.suggestions.map((suggestion, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleSelectSuggestion(lead.id, idx)}
                                      className={`w-full text-left p-2 rounded border text-xs transition-all ${
                                        messages[lead.id]?.selectedIndex === idx
                                          ? 'bg-red-100 dark:bg-red-950/40 border-red-400 dark:border-red-600'
                                          : 'bg-white/20 dark:bg-black/20 border-red-200/30 dark:border-red-800/30 hover:bg-white/30'
                                      }`}
                                    >
                                      <div className="flex items-start gap-2">
                                        <span className={`text-xs font-bold flex-shrink-0 ${
                                          messages[lead.id]?.selectedIndex === idx 
                                            ? 'text-red-600 dark:text-red-400' 
                                            : 'text-muted-foreground'
                                        }`}>
                                          {idx + 1}.
                                        </span>
                                        <span className="line-clamp-2 text-foreground/80">{suggestion}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Edit Mode */}
                              {editingMessage === lead.id ? (
                                <div className="space-y-2 bg-white/20 dark:bg-black/40 p-2.5 rounded border border-red-200/50 dark:border-red-800/50">
                                  <p className="text-xs font-bold text-foreground">Editar Mensagem</p>
                                  <textarea
                                    defaultValue={messages[lead.id]?.editedContent || messages[lead.id]?.suggestions[messages[lead.id]?.selectedIndex]}
                                    onChange={(e) => {
                                      const newContent = e.target.value;
                                      if (newContent) {
                                        setMessages(prev => ({
                                          ...prev,
                                          [lead.id]: {
                                            ...prev[lead.id],
                                            editedContent: newContent
                                          }
                                        }));
                                      }
                                    }}
                                    className="w-full h-24 p-2 bg-white/50 dark:bg-black/40 text-foreground text-xs rounded border border-red-200/30 dark:border-red-800/30 resize-none focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                                    placeholder="Edite a mensagem conforme necessário..."
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="flex-1 h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() => {
                                        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
                                        handleSaveEdit(lead.id, textarea?.value || '');
                                      }}
                                    >
                                      Salvar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 h-7 text-xs"
                                      onClick={() => {
                                        setEditingMessage(null);
                                        setMessages(prev => ({
                                          ...prev,
                                          [lead.id]: {
                                            ...prev[lead.id],
                                            editedContent: undefined
                                          }
                                        }));
                                      }}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-foreground">Mensagem Selecionada</p>
                                    <button
                                      onClick={() => toggleMessageExpand(lead.id)}
                                      className="text-red-600 hover:text-red-700 transition-colors"
                                    >
                                      {messages[lead.id]?.isExpanded ? (
                                        <ChevronUp className="w-4 h-4" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>

                                  {messages[lead.id]?.isExpanded ? (
                                    <div className="max-h-48 overflow-y-auto">
                                      <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words bg-white/20 dark:bg-black/20 p-2 rounded">
                                        {messages[lead.id]?.editedContent || messages[lead.id]?.suggestions[messages[lead.id]?.selectedIndex]}
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-foreground/80 line-clamp-3 bg-white/20 dark:bg-black/20 p-2 rounded">
                                      {messages[lead.id]?.editedContent || messages[lead.id]?.suggestions[messages[lead.id]?.selectedIndex]}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Message Action Buttons */}
                              {editingMessage !== lead.id && (
                                <div className="flex gap-2 pt-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 h-7 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold"
                                    onClick={() => handleSendMessage(lead)}
                                    disabled={sendingStates[lead.id]?.isSending}
                                  >
                                    {sendingStates[lead.id]?.isSending ? (
                                      <>
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Enviando...
                                      </>
                                    ) : sendingStates[lead.id]?.sentAt ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Enviado
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-3.5 h-3.5" />
                                        Enviar
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 px-2"
                                    onClick={() => handleCopyMessage(lead.id)}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 px-2"
                                    onClick={() => handleEditMessage(lead.id)}
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="w-full gap-1.5 h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleGenerateMessage(lead)}
                              disabled={generatingFor === lead.id}
                            >
                              {generatingFor === lead.id
                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <Zap className="w-3.5 h-3.5" />
                              }
                              {generatingFor === lead.id ? 'Gerando...' : 'Gerar Mensagem Urgente'}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Recommended Actions Section */}
            {insights.recommendedActions?.length > 0 && (
              <div className="space-y-3 mt-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-bold text-foreground">Próximas Ações Automáticas</h3>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-semibold">
                    {insights.recommendedActions.length} sugestões
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {insights.recommendedActions.map((lead: any) => (
                    <div key={lead.id} className="bg-card border border-border rounded-lg p-3 space-y-3 hover:border-primary/50 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-primary">
                            {(lead.name || 'L').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{lead.name}</p>
                          <p className="text-[10px] text-muted-foreground">{lead.conversion_probability}% conversão</p>
                        </div>
                      </div>

                      {lead.next_best_action && (
                        <p className="text-xs text-foreground/80 bg-muted/30 p-2 rounded border border-border">
                          {lead.next_best_action}
                        </p>
                      )}

                      {messages[lead.id] ? (
                        <div className="space-y-2 bg-muted/20 p-2 rounded-lg border border-border">
                          <p className="text-xs font-semibold text-foreground">Prévia da Mensagem</p>
                          <p className="text-xs text-foreground/80 line-clamp-3">
                            {messages[lead.id]?.editedContent || messages[lead.id]?.suggestions[messages[lead.id]?.selectedIndex]}
                          </p>
                          <Button
                            size="sm"
                            className="w-full gap-1.5 h-7 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                            onClick={() => handleSendMessage(lead)}
                            disabled={sendingStates[lead.id]?.isSending}
                          >
                            {sendingStates[lead.id]?.isSending ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Enviando...
                              </>
                            ) : sendingStates[lead.id]?.sentAt ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Enviado
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                Enviar
                              </>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full gap-1.5 h-7 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                          onClick={() => handleGenerateMessage(lead)}
                          disabled={generatingFor === lead.id}
                        >
                          {generatingFor === lead.id
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <ArrowRight className="w-3 h-3" />
                          }
                          {generatingFor === lead.id ? 'Gerando...' : 'Gerar Ação'}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Pronto para Análise</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              A IA identificará leads quentes, alertará sobre riscos e sugerirá ações automáticas.
            </p>
            <Button onClick={handleAnalyzeLeads} disabled={analyzing} className="gap-2 px-6">
              {analyzing
                ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <Zap className="w-4 h-4" />
              }
              {analyzing ? 'Analisando...' : 'Iniciar Análise Inteligente'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

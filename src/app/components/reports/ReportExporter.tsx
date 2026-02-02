import { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  Users,
  Target,
  DollarSign,
  BarChart3,
  X,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { toast } from "sonner";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportExporterProps {
  isOpen: boolean;
  onClose: () => void;
  leads: any[];
  isDark?: boolean;
}

const REPORT_SECTIONS = [
  { id: 'overview', label: 'Visão Geral', icon: BarChart3, description: 'Resumo executivo com principais métricas' },
  { id: 'funnel', label: 'Funil de Vendas', icon: Target, description: 'Análise de conversão por estágio' },
  { id: 'sources', label: 'Fontes de Leads', icon: Users, description: 'Distribuição por origem' },
  { id: 'timeline', label: 'Linha do Tempo', icon: Calendar, description: 'Evolução temporal dos leads' },
  { id: 'performance', label: 'Performance', icon: TrendingUp, description: 'KPIs e taxas de conversão' },
  { id: 'revenue', label: 'Receita Estimada', icon: DollarSign, description: 'Projeções e valores' },
];

export default function ReportExporter({ isOpen, onClose, leads, isDark = false }: ReportExporterProps) {
  const [selectedSections, setSelectedSections] = useState<string[]>(['overview', 'funnel', 'performance']);
  const [reportPeriod, setReportPeriod] = useState('all');
  const [reportFormat, setReportFormat] = useState('pdf');
  const [isGenerating, setIsGenerating] = useState(false);

  const toggleSection = (sectionId: string) => {
    setSelectedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const generateHTMLReport = () => {
    const filteredLeads = filterLeadsByPeriod(leads, reportPeriod);

    // Estatísticas
    const stats = calculateStats(filteredLeads);

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório LeadsFlow - ${format(new Date(), "dd/MM/yyyy")}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 40px 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #6366F1; padding-bottom: 20px; }
    .header h1 { color: #6366F1; font-size: 32px; margin-bottom: 10px; }
    .header p { color: #666; font-size: 14px; }
    .section { margin-bottom: 40px; }
    .section-title { font-size: 24px; color: #333; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb; display: flex; align-items: center; gap: 10px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }
    .stat-card.green { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
    .stat-card.blue { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
    .stat-card.orange { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
    .stat-card.red { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
    .stat-label { font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { font-size: 32px; font-weight: bold; margin-top: 5px; }
    .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .table th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
    .table td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .table tr:hover { background: #f9fafb; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .badge.success { background: #d1fae5; color: #065f46; }
    .badge.warning { background: #fed7aa; color: #92400e; }
    .badge.info { background: #dbeafe; color: #1e40af; }
    .badge.danger { background: #fee2e2; color: #991b1b; }
    .chart-bar { background: #e5e7eb; height: 30px; border-radius: 4px; overflow: hidden; margin: 10px 0; }
    .chart-bar-fill { background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); height: 100%; display: flex; align-items: center; padding: 0 10px; color: white; font-size: 12px; font-weight: 600; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 12px; }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    ${generateHeader()}
    ${selectedSections.includes('overview') ? generateOverview(stats, filteredLeads) : ''}
    ${selectedSections.includes('funnel') ? generateFunnel(stats) : ''}
    ${selectedSections.includes('sources') ? generateSources(filteredLeads) : ''}
    ${selectedSections.includes('timeline') ? generateTimeline(filteredLeads) : ''}
    ${selectedSections.includes('performance') ? generatePerformance(stats) : ''}
    ${selectedSections.includes('revenue') ? generateRevenue(stats, filteredLeads) : ''}
    ${generateFooter()}
  </div>
</body>
</html>`;

    return html;
  };

  const generateHeader = () => `
    <div class="header">
      <h1>📊 Relatório de Leads - LeadsFlow</h1>
      <p>Gerado em ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</p>
      <p>Período: ${getPeriodLabel(reportPeriod)}</p>
    </div>
  `;

  const generateOverview = (stats: any, filteredLeads: any[]) => `
    <div class="section">
      <h2 class="section-title">📈 Visão Geral</h2>
      <div class="stats-grid">
        <div class="stat-card blue">
          <div class="stat-label">Total de Leads</div>
          <div class="stat-value">${stats.total}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Convertidos</div>
          <div class="stat-value">${stats.converted}</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-label">Taxa de Conversão</div>
          <div class="stat-value">${stats.conversionRate}%</div>
        </div>
        <div class="stat-card red">
          <div class="stat-label">Perdidos</div>
          <div class="stat-value">${stats.lost}</div>
        </div>
      </div>
      <p style="color: #666; margin-top: 20px;">
        <strong>Resumo Executivo:</strong> No período analisado, foram captados ${stats.total} leads,
        dos quais ${stats.converted} foram convertidos (${stats.conversionRate}% de taxa de conversão).
        Atualmente há ${stats.inProgress} leads em andamento e ${stats.lost} foram perdidos.
      </p>
    </div>
  `;

  const generateFunnel = (stats: any) => `
    <div class="section">
      <h2 class="section-title">🎯 Funil de Vendas</h2>
      <div style="margin-top: 20px;">
        ${generateFunnelBar('Novos Leads', stats.byStatus.novo || 0, stats.total)}
        ${generateFunnelBar('Contatados', stats.byStatus.contatado || 0, stats.total)}
        ${generateFunnelBar('Qualificados', stats.byStatus.qualificado || 0, stats.total)}
        ${generateFunnelBar('Em Negociação', stats.byStatus.negociacao || 0, stats.total)}
        ${generateFunnelBar('Convertidos', stats.byStatus.convertido || 0, stats.total, '#10b981')}
        ${generateFunnelBar('Perdidos', stats.byStatus.perdido || 0, stats.total, '#ef4444')}
      </div>
    </div>
  `;

  const generateFunnelBar = (label: string, value: number, total: number, color: string = '#667eea') => {
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
    return `
      <div style="margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="font-weight: 500;">${label}</span>
          <span style="color: #666;">${value} (${percentage}%)</span>
        </div>
        <div class="chart-bar">
          <div class="chart-bar-fill" style="width: ${percentage}%; background: ${color};">
            ${percentage}%
          </div>
        </div>
      </div>
    `;
  };

  const generateSources = (filteredLeads: any[]) => {
    const sourceStats = filteredLeads.reduce((acc: any, lead) => {
      const source = lead.origem || 'Desconhecido';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    const sortedSources = Object.entries(sourceStats)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10);

    return `
      <div class="section">
        <h2 class="section-title">📍 Top 10 Fontes de Leads</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Quantidade</th>
              <th>Percentual</th>
            </tr>
          </thead>
          <tbody>
            ${sortedSources.map(([source, count]) => {
      const percentage = ((count as number / filteredLeads.length) * 100).toFixed(1);
      return `
                <tr>
                  <td><strong>${source}</strong></td>
                  <td>${count}</td>
                  <td><span class="badge info">${percentage}%</span></td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const generateTimeline = (filteredLeads: any[]) => `
    <div class="section">
      <h2 class="section-title">📅 Evolução Temporal</h2>
      <p style="color: #666; margin-top: 10px;">
        Gráfico de evolução temporal será renderizado no PDF final.
      </p>
    </div>
  `;

  const generatePerformance = (stats: any) => `
    <div class="section">
      <h2 class="section-title">🎯 Indicadores de Performance</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Métrica</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Taxa de Conversão</td>
            <td><strong>${stats.conversionRate}%</strong></td>
            <td><span class="badge ${parseFloat(stats.conversionRate) > 20 ? 'success' : 'warning'}">
              ${parseFloat(stats.conversionRate) > 20 ? 'Excelente' : 'Em desenvolvimento'}
            </span></td>
          </tr>
          <tr>
            <td>Taxa de Qualificação</td>
            <td><strong>${stats.qualificationRate}%</strong></td>
            <td><span class="badge ${parseFloat(stats.qualificationRate) > 30 ? 'success' : 'warning'}">
              ${parseFloat(stats.qualificationRate) > 30 ? 'Ótimo' : 'Regular'}
            </span></td>
          </tr>
          <tr>
            <td>Taxa de Perda</td>
            <td><strong>${stats.lostRate}%</strong></td>
            <td><span class="badge ${parseFloat(stats.lostRate) < 30 ? 'success' : 'danger'}">
              ${parseFloat(stats.lostRate) < 30 ? 'Aceitável' : 'Atenção necessária'}
            </span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const generateRevenue = (stats: any, filteredLeads: any[]) => {
    const totalRevenue = filteredLeads.reduce((sum, lead) => sum + (lead.valor_estimado || 0), 0);
    const avgRevenue = filteredLeads.length > 0 ? totalRevenue / filteredLeads.length : 0;

    return `
      <div class="section">
        <h2 class="section-title">💰 Receita Estimada</h2>
        <div class="stats-grid">
          <div class="stat-card blue">
            <div class="stat-label">Receita Total</div>
            <div class="stat-value">R$ ${totalRevenue.toLocaleString('pt-BR')}</div>
          </div>
          <div class="stat-card green">
            <div class="stat-label">Valor Médio por Lead</div>
            <div class="stat-value">R$ ${avgRevenue.toFixed(2)}</div>
          </div>
        </div>
      </div>
    `;
  };

  const generateFooter = () => `
    <div class="footer">
      <p><strong>LeadsFlow SAAS</strong> - Sistema de Gestão de Leads</p>
      <p>© ${new Date().getFullYear()} PersonalCreativeLda. Todos os direitos reservados.</p>
      <p style="margin-top: 10px; font-size: 11px; color: #999;">
        Este relatório foi gerado automaticamente e contém informações confidenciais.
      </p>
    </div>
  `;

  const filterLeadsByPeriod = (leads: any[], period: string) => {
    if (period === 'all') return leads;

    const now = new Date();
    const cutoffDate = new Date();

    switch (period) {
      case '7days':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        cutoffDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        cutoffDate.setDate(now.getDate() - 90);
        break;
      default:
        return leads;
    }

    return leads.filter(lead => {
      if (!lead.data) return false;
      const leadDate = new Date(lead.data);
      return leadDate >= cutoffDate;
    });
  };

  const calculateStats = (filteredLeads: any[]) => {
    const total = filteredLeads.length;
    const byStatus = filteredLeads.reduce((acc: any, lead) => {
      const status = (lead.status || 'novo').toLowerCase();
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const converted = byStatus.convertido || 0;
    const lost = byStatus.perdido || 0;
    const qualified = byStatus.qualificado || 0;
    const inProgress = total - converted - lost;

    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0';
    const lostRate = total > 0 ? ((lost / total) * 100).toFixed(1) : '0';
    const qualificationRate = total > 0 ? ((qualified / total) * 100).toFixed(1) : '0';

    return {
      total,
      converted,
      lost,
      qualified,
      inProgress,
      byStatus,
      conversionRate,
      lostRate,
      qualificationRate,
    };
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'all': return 'Todos os períodos';
      case '7days': return 'Últimos 7 dias';
      case '30days': return 'Últimos 30 dias';
      case '90days': return 'Últimos 90 dias';
      default: return 'Todos os períodos';
    }
  };

  const handleGenerateReport = async () => {
    if (selectedSections.length === 0) {
      toast.error('Selecione pelo menos uma seção para incluir no relatório');
      return;
    }

    setIsGenerating(true);

    try {
      const html = generateHTMLReport();

      if (reportFormat === 'html') {
        // Download HTML
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-leadsflow-${format(new Date(), 'yyyy-MM-dd')}.html`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Para PDF, abrir em nova janela para imprimir
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          setTimeout(() => {
            printWindow.print();
          }, 500);
        }
      }

      toast.success('Relatório gerado com sucesso!');
      onClose();
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Erro ao gerar relatório');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-white' : 'text-foreground'}`}>
            <FileText className="w-5 h-5" />
            Gerar Relatório Avançado
          </DialogTitle>
          <DialogDescription className={isDark ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}>
            Personalize e exporte um relatório detalhado dos seus leads
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Configurações do Relatório */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Período
              </label>
              <Select value={reportPeriod} onValueChange={setReportPeriod}>
                <SelectTrigger className="bg-background text-foreground border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-popover-foreground border-border shadow-md">
                  <SelectItem value="all" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">Todos os períodos</SelectItem>
                  <SelectItem value="7days" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">Últimos 7 dias</SelectItem>
                  <SelectItem value="30days" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">Últimos 30 dias</SelectItem>
                  <SelectItem value="90days" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Formato
              </label>
              <Select value={reportFormat} onValueChange={setReportFormat}>
                <SelectTrigger className="bg-background text-foreground border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-popover-foreground border-border shadow-md">
                  <SelectItem value="pdf" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">PDF (Imprimir)</SelectItem>
                  <SelectItem value="html" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Seções do Relatório */}
          <div>
            <h3 className={`text-sm mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Seções do Relatório
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {REPORT_SECTIONS.map(section => {
                const Icon = section.icon;
                const isSelected = selectedSections.includes(section.id);

                return (
                  <Card
                    key={section.id}
                    className={`p-4 cursor-pointer transition-all ${isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : isDark
                        ? 'bg-gray-700 border-gray-600 hover:bg-gray-650'
                        : 'hover:bg-gray-50'
                      }`}
                    onClick={() => toggleSection(section.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSection(section.id)} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-4 h-4" />
                          <span className={`font-medium text-sm ${isDark ? 'text-white' : 'text-foreground'}`}>
                            {section.label}
                          </span>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {section.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Preview Info */}
          <Card className={`p-4 ${isDark ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              <div className="flex-1">
                <p className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>
                  <strong>{selectedSections.length}</strong> seção(ões) selecionada(s)
                </p>
                <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                  Período: {getPeriodLabel(reportPeriod)} • Formato: {reportFormat.toUpperCase()}
                </p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isGenerating}
              className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerateReport}
              disabled={isGenerating || selectedSections.length === 0}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 border-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Gerar Relatório
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



import { Download } from 'lucide-react';
import jsPDF from 'jspdf';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { StatusBadge, type StatusTone } from '../base/StatusBadge';

interface Campaign {
  id: string;
  name: string;
  type: 'whatsapp' | 'email' | 'sms';
  status: 'active' | 'scheduled' | 'completed' | 'paused' | 'failed';
  totalRecipients: number;
  sent?: number;
  delivered?: number;
  read?: number;
  replies?: number;
  failed?: number;
  scheduledDate?: string;
  completedDate?: string;
  progress?: number;
  estimatedTime?: number;
  deliveryRate?: number;
  metadata?: {
    failures?: Array<{
      email?: string;
      phone?: string;
      name?: string;
      error: string;
      timestamp: string;
    }>;
  };
}

interface CampaignDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
}

// Estado real da campanha (campaign.status) → tom do StatusBadge. Quando
// "completed" com falhas reais (campaign.failed > 0), usa tom de aviso
// ("parcial") em vez de sucesso — mesma distinção que "envio parcial" pedida,
// derivada de dados já existentes, sem inventar nenhum estado novo.
function getCampaignStatusTone(campaign: Campaign): { tone: StatusTone; label: string } {
  switch (campaign.status) {
    case 'active':
      return { tone: 'info', label: 'Ativa' };
    case 'scheduled':
      return { tone: 'secondary', label: 'Agendada' };
    case 'paused':
      return { tone: 'warning', label: 'Pausada' };
    case 'failed':
      return { tone: 'error', label: 'Falhou' };
    case 'completed': {
      const hasFailures = (campaign.failed ?? campaign.metadata?.failures?.length ?? 0) > 0;
      return hasFailures ? { tone: 'warning', label: 'Concluída (parcial)' } : { tone: 'success', label: 'Concluída' };
    }
    default:
      return { tone: 'default', label: campaign.status };
  }
}

export default function CampaignDetailsModal({ isOpen, onClose, campaign }: CampaignDetailsModalProps) {
  if (!campaign) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    // Logo/Título
    doc.setFontSize(20);
    doc.setTextColor(16, 185, 129);
    doc.text('LeadsFlow API', 20, 20);

    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('Relatório de Campanha', 20, 35);

    // Linha divisória
    doc.setDrawColor(220, 220, 220);
    doc.line(20, 40, 190, 40);

    // Informações da Campanha
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Nome da Campanha:', 20, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(campaign.name, 80, 55);

    doc.setFont('helvetica', 'bold');
    doc.text('Canal:', 20, 65);
    doc.setFont('helvetica', 'normal');
    const channelName = campaign.type === 'whatsapp' ? 'WhatsApp' : campaign.type === 'email' ? 'Email' : 'SMS';
    doc.text(channelName, 80, 65);

    doc.setFont('helvetica', 'bold');
    doc.text('Status:', 20, 75);
    doc.setFont('helvetica', 'normal');
    const statusName = campaign.status === 'active' ? 'Ativa' :
      campaign.status === 'completed' ? 'Concluída' :
        campaign.status === 'paused' ? 'Pausada' :
          campaign.status === 'failed' ? 'Falhou' : 'Agendada';
    doc.text(statusName, 80, 75);

    if (campaign.completedDate) {
      doc.setFont('helvetica', 'bold');
      doc.text('Data de Conclusão:', 20, 85);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDate(campaign.completedDate), 80, 85);
    }

    // Seção de Métricas
    doc.setDrawColor(220, 220, 220);
    doc.line(20, 95, 190, 95);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Métricas de Desempenho', 20, 110);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    let yPos = 125;

    // Total de Destinatários
    doc.setFont('helvetica', 'bold');
    doc.text('Total de Destinatários:', 30, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(campaign.totalRecipients.toLocaleString(), 120, yPos);
    yPos += 10;

    // Enviadas
    if (campaign.sent !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('Mensagens Enviadas:', 30, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(campaign.sent.toLocaleString(), 120, yPos);
      yPos += 10;
    }

    // Entregues
    if (campaign.delivered !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('Entregues:', 30, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(campaign.delivered.toLocaleString(), 120, yPos);
      yPos += 10;
    }

    // Lidas
    if (campaign.read !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('Visualizadas:', 30, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(campaign.read.toLocaleString(), 120, yPos);
      yPos += 10;
    }

    // Respostas
    if (campaign.replies !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('Respostas:', 30, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(campaign.replies.toLocaleString(), 120, yPos);
      yPos += 10;
    }

    // Taxa de Entrega
    if (campaign.deliveryRate !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('Taxa de Entrega:', 30, yPos);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 185, 129);
      doc.text(`${campaign.deliveryRate}%`, 120, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 10;
    }

    // Progresso (se ativa)
    if (campaign.status === 'active' && campaign.progress !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('Progresso:', 30, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`${campaign.progress}%`, 120, yPos);
      yPos += 10;
    }

    // Seção de Falhas (Novo)
    const failures = campaign.metadata?.failures || [];
    if (failures.length > 0) {
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(220, 38, 38); // Vermelho
      doc.text('Relatório de Falhas/Erros', 20, 20);

      doc.setDrawColor(220, 220, 220);
      doc.line(20, 25, 190, 25);

      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);

      let failY = 35;
      failures.forEach((f, idx) => {
        if (failY > 270) {
          doc.addPage();
          failY = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.text(`${idx + 1}. ${f.name || 'Destinatário'}`, 20, failY);
        doc.setFont('helvetica', 'normal');
        doc.text(`Contato: ${f.email || f.phone || 'N/A'}`, 25, failY + 5);
        doc.setTextColor(220, 38, 38);
        doc.text(`Erro: ${f.error}`, 25, failY + 10);
        doc.setTextColor(150, 150, 150);
        doc.text(`Horário: ${new Date(f.timestamp).toLocaleString('pt-BR')}`, 25, failY + 15);
        doc.setTextColor(0, 0, 0);

        failY += 25;
      });
    }

    // Rodapé
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 20, 285);
      doc.text(`Página ${i} de ${pageCount}`, 170, 285);
    }

    // Baixar PDF
    doc.save(`campanha_${campaign.id}_relatorio.pdf`);
  };

  const exportToCSV = () => {
    const csvData = [
      ['LeadsFlow API - Relatório de Campanha'],
      [''],
      ['Nome da Campanha', campaign.name],
      ['Canal', campaign.type === 'whatsapp' ? 'WhatsApp' : campaign.type === 'email' ? 'Email' : 'SMS'],
      ['Status', campaign.status === 'active' ? 'Ativa' : campaign.status === 'completed' ? 'Concluída' : campaign.status === 'paused' ? 'Pausada' : 'Agendada'],
      ...(campaign.completedDate ? [['Data de Conclusão', formatDate(campaign.completedDate)]] : []),
      [''],
      ['Métricas'],
      ['Total de Destinatários', campaign.totalRecipients.toString()],
      ...(campaign.sent !== undefined ? [['Mensagens Enviadas', campaign.sent.toString()]] : []),
      ...(campaign.delivered !== undefined ? [['Entregues', campaign.delivered.toString()]] : []),
      ...(campaign.read !== undefined ? [['Visualizadas', campaign.read.toString()]] : []),
      ...(campaign.replies !== undefined ? [['Respostas', campaign.replies.toString()]] : []),
      ...(campaign.deliveryRate !== undefined ? [['Taxa de Entrega', `${campaign.deliveryRate}%`]] : []),
      ...(campaign.progress !== undefined && campaign.status === 'active' ? [['Progresso', `${campaign.progress}%`]] : []),
      [''],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `campanha_${campaign.id}_dados.csv`;
    link.click();
  };

  const failures = campaign.metadata?.failures || [];
  const statusInfo = getCampaignStatusTone(campaign);

  return (
    <AppModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="p-0 gap-0 max-h-[90vh] flex flex-col"
      title={
        <div>
          <span>Detalhes da Campanha</span>
          <p className="text-sm text-muted-foreground font-normal mt-0.5">{campaign.name}</p>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4 w-full">
          <div className="flex flex-wrap gap-2.5">
            <AppButton onClick={exportToPDF} variant="outline">
              <Download />
              Baixar PDF
            </AppButton>
            <AppButton onClick={exportToCSV} variant="outline">
              <Download />
              Exportar CSV
            </AppButton>
          </div>
          <AppButton onClick={onClose}>Fechar</AppButton>
        </div>
      }
    >
        {/* Body */}
        <div className="px-6 pb-2 flex-1 space-y-8">
          {/* Informações Gerais */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Informações Gerais</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-muted/50 p-4 rounded-xl border border-border dark:border-zinc-800/60">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Canal</p>
                <p className="text-base font-bold flex items-center gap-2">
                  {campaign.type === 'whatsapp' ? '📱 WhatsApp' : campaign.type === 'email' ? '📧 Email' : '💬 SMS'}
                </p>
              </div>
              <div className="bg-muted/50 p-4 rounded-xl border border-border dark:border-zinc-800/60">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Status</p>
                <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
              </div>
              {campaign.completedDate && (
                <div className="bg-muted/50 p-4 rounded-xl border border-border dark:border-zinc-800/60 sm:col-span-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Data de Conclusão</p>
                  <p className="text-base font-bold text-primary">{formatDate(campaign.completedDate)}</p>
                </div>
              )}
            </div>
          </section>

          {/* Métricas */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Métricas de Desempenho</h3>
            </div>
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-2 tracking-tight">Destinatários</p>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-300 tracking-tighter">{campaign.totalRecipients.toLocaleString()}</p>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-2 tracking-tight">Enviadas</p>
                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-300 tracking-tighter">{(campaign.sent || 0).toLocaleString()}</p>
              </div>

              <div className="bg-violet-50 dark:bg-violet-900/20 p-5 rounded-2xl border border-violet-100 dark:border-violet-900/40">
                <p className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase mb-2 tracking-tight">Entregues</p>
                <p className="text-3xl font-black text-violet-700 dark:text-violet-300 tracking-tighter">{(campaign.delivered || 0).toLocaleString()}</p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase mb-2 tracking-tight">Visualizadas</p>
                <p className="text-3xl font-black text-amber-700 dark:text-amber-300 tracking-tighter">{(campaign.read || 0).toLocaleString()}</p>
              </div>

              <div className="bg-rose-50 dark:bg-rose-900/20 p-5 rounded-2xl border border-rose-100 dark:border-rose-900/40">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase mb-2 tracking-tight">Falhas</p>
                <p className="text-3xl font-black text-rose-700 dark:text-rose-300 tracking-tighter">{(campaign.failed || failures.length || 0).toLocaleString()}</p>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 p-5 rounded-2xl border border-green-100 dark:border-green-900/40">
                <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase mb-2 tracking-tight">Taxa de Entrega</p>
                <p className="text-3xl font-black text-green-700 dark:text-green-300 tracking-tighter">{campaign.deliveryRate || 0}%</p>
              </div>
            </div>
          </section>

          {/* Lista de Falhas (Se houver) */}
          {failures.length > 0 && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-400">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-red-500 rounded-full" />
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Logs de Falha</h3>
              </div>
              <div className="bg-muted/30 rounded-2xl border border-border overflow-hidden">
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-muted sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase">Destinatário</th>
                        <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase">Erro</th>
                        <th className="px-4 py-3 text-xs font-bold text-muted-foreground text-center uppercase">Horário</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {failures.map((f, i) => (
                        <tr key={i} className="hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 text-sm">
                            <p className="font-bold text-foreground">{f.name || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground">{f.email || f.phone}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-red-500/90 dark:text-red-400 font-medium">
                            {f.error}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground text-center">
                            {new Date(f.timestamp).toLocaleTimeString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Progresso (se ativa) */}
          {campaign.status === 'active' && campaign.progress !== undefined && (
            <section className="bg-muted/30 p-5 rounded-2xl border border-border/50">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <h4 className="text-sm font-bold text-foreground tracking-tight">Status do Envio</h4>
                  <p className="text-xs text-muted-foreground">Sincronizando com o servidor...</p>
                </div>
                <span className="text-2xl font-black text-primary">{campaign.progress}%</span>
              </div>
              <div className="w-full bg-muted-foreground/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-primary/60 h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${campaign.progress}%` }}
                />
              </div>
              {campaign.estimatedTime && (
                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
                  Tempo restante estimado: ~{campaign.estimatedTime} min
                </div>
              )}
            </section>
          )}
        </div>
    </AppModal>
  );
}




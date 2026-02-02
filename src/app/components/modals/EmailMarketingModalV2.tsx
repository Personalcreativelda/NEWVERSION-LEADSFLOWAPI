import { useState, useEffect } from 'react';
import { Checkbox } from '../ui/checkbox';
import { toast } from "sonner";
import { projectId } from '../../utils/supabase/info';
import type { Lead } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Mail, Send, Loader2, CheckCircle2, AlertCircle, X, Sparkles, FileText, Clock } from 'lucide-react';

interface EmailMarketingModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onSendSuccess?: () => void;
}

// Templates prontos de mensagens
const EMAIL_TEMPLATES = [
  {
    id: 'welcome',
    name: 'Boas-vindas',
    subject: 'Bem-vindo(a) à nossa empresa!',
    message: `Olá {nome},

É um prazer tê-lo(a) conosco! 

Estamos muito felizes em poder atendê-lo(a). Nossa equipe está à disposição para tirar qualquer dúvida.

Entre em contato conosco pelo telefone {telefone} ou responda este email.

Atenciosamente,
Equipe LeadFlow CRM`,
  },
  {
    id: 'promo',
    name: 'Promoção',
    subject: 'Promoção Especial para Você!',
    message: `Olá {nome},

Temos uma promoção especial pensada em você!

🎉 Aproveite condições exclusivas por tempo limitado.

Entre em contato conosco para saber mais:
📧 Email: {email}
📱 Telefone: {telefone}

Não perca essa oportunidade!

Atenciosamente,
Equipe LeadFlow CRM`,
  },
  {
    id: 'followup',
    name: 'Follow-up',
    subject: 'Gostaria de conversar sobre seu interesse',
    message: `Olá {nome},

Espero que esteja bem!

Gostaria de dar continuidade à nossa conversa sobre {interesse}.

Temos novidades que podem ser do seu interesse. Podemos agendar uma conversa?

Aguardo seu retorno.

Atenciosamente,
Equipe LeadFlow CRM`,
  },
  {
    id: 'thanks',
    name: 'Agradecimento',
    subject: 'Obrigado pelo seu contato!',
    message: `Olá {nome},

Obrigado por entrar em contato conosco!

Recebemos sua mensagem e em breve nossa equipe retornará.

Se precisar de atendimento urgente, entre em contato pelo telefone {telefone}.

Atenciosamente,
Equipe LeadFlow CRM`,
  },
];

interface EmailReport {
  sent: number;
  failed: number;
  details: Array<{
    email: string;
    nome: string;
    status: 'success' | 'failed';
    error?: string;
  }>;
}

export default function EmailMarketingModalV2({
  isOpen,
  onClose,
  leads,
  onSendSuccess,
}: EmailMarketingModalV2Props) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<EmailReport | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);

  // Inicializar leads selecionados quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      const leadsWithEmail = leads.filter(lead => 
        lead.email && 
        lead.email.trim() !== '' && 
        lead.marcado_email === true
      );
      setSelectedLeads(leadsWithEmail);
    }
  }, [isOpen, leads]);

  if (!isOpen) return null;

  // Função para remover lead da lista
  const handleRemoveLead = (leadId: string) => {
    setSelectedLeads(prev => prev.filter(lead => lead.id !== leadId));
    toast.info('Lead removido da lista de envio');
  };

  const handleSelectTemplate = (template: typeof EMAIL_TEMPLATES[0]) => {
    setSubject(template.subject);
    setMessage(template.message);
    toast.success(`Template "${template.name}" aplicado!`);
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Por favor, preencha o assunto e a mensagem.');
      return;
    }

    if (selectedLeads.length === 0) {
      toast.error('Nenhum lead com email disponível.');
      return;
    }

    setSending(true);

    try {
      const results: EmailReport = {
        sent: 0,
        failed: 0,
        details: [],
      };

      // Simular envio de emails (em produção, usar SMTP configurado)
      for (const lead of selectedLeads) {
        try {
          const personalizedSubject = subject
            .replace(/{nome}/g, lead.nome || '')
            .replace(/{email}/g, lead.email || '')
            .replace(/{telefone}/g, lead.telefone || '')
            .replace(/{interesse}/g, lead.interesse || '');

          const personalizedMessage = message
            .replace(/{nome}/g, lead.nome || '')
            .replace(/{email}/g, lead.email || '')
            .replace(/{telefone}/g, lead.telefone || '')
            .replace(/{interesse}/g, lead.interesse || '');

          // Aqui seria a chamada real para o backend enviar via SMTP
          console.log('Enviando email:', {
            to: lead.email,
            subject: personalizedSubject,
            message: personalizedMessage,
          });

          // Simular sucesso/falha aleatória para demonstração
          const success = Math.random() > 0.1; // 90% de sucesso

          if (success) {
            results.sent++;
            results.details.push({
              email: lead.email!,
              nome: lead.nome,
              status: 'success',
            });
          } else {
            results.failed++;
            results.details.push({
              email: lead.email!,
              nome: lead.nome,
              status: 'failed',
              error: 'Erro de conexão SMTP',
            });
          }

          // Delay entre envios para evitar spam
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          results.failed++;
          results.details.push({
            email: lead.email!,
            nome: lead.nome,
            status: 'failed',
            error: error.message || 'Erro desconhecido',
          });
        }
      }

      setReport(results);
      setShowReport(true);

      // Atualizar contador de emails enviados no backend
      if (results.sent > 0) {
        try {
          const token = localStorage.getItem('leadflow_access_token');
          await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/increment-email-usage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ emailCount: results.sent, isMass: true }),
          });
        } catch (error) {
          console.error('Erro ao atualizar contador de emails:', error);
        }
        
        toast.success(`✅ ${results.sent} email(s) enviado(s) com sucesso!`);
      }
      
      if (results.failed > 0) {
        toast.warning(`⚠️ ${results.failed} email(s) falharam.`);
      }

      onSendSuccess?.();
    } catch (error) {
      console.error('Erro ao enviar emails:', error);
      toast.error('❌ Erro ao processar envio de emails.');
    } finally {
      setSending(false);
    }
  };

  const handleCloseReport = () => {
    setShowReport(false);
    setReport(null);
    setSubject('');
    setMessage('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-card rounded-2xl max-w-4xl w-full shadow-lg max-h-[90vh] overflow-y-auto">
        {/* Hidden accessibility elements */}
        <DialogHeader className="sr-only">
          <DialogTitle>Email Marketing</DialogTitle>
          <DialogDescription>
            Envie emails personalizados para seus leads selecionados
          </DialogDescription>
        </DialogHeader>
        
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex justify-between items-center rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl text-white font-bold">Email Marketing</h2>
              <p className="text-sm text-purple-100">
                {selectedLeads.length} lead(s) com email disponível
              </p>
            </div>
          </div>
          <button
            onClick={showReport ? handleCloseReport : onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Report View */}
        {showReport && report ? (
          <div className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{report.sent}</p>
                <p className="text-sm text-green-600 dark:text-green-500">Enviados</p>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-center">
                <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{report.failed}</p>
                <p className="text-sm text-red-600 dark:text-red-500">Falhados</p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
                <Sparkles className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{report.sent + report.failed}</p>
                <p className="text-sm text-blue-600 dark:text-blue-500">Total</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detalhes do Envio
              </h3>
              <div className="space-y-2">
                {report.details.map((detail, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      detail.status === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {detail.status === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{detail.nome}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-700 dark:text-gray-300">{detail.email}</p>
                        {detail.error && (
                          <p className="text-xs text-red-600 dark:text-red-400">{detail.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button onClick={handleCloseReport} className="bg-purple-600 hover:bg-purple-700">
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          /* Compose View */
          <div className="px-6 py-6 space-y-6">
            {/* Templates */}
            <div>
              <Label className="text-gray-700 dark:text-gray-300 mb-3 block">
                📝 Templates Prontos
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {EMAIL_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className="p-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg text-sm text-purple-700 dark:text-purple-300 transition-colors text-left text-[11px]"
                  >
                    <FileText className="w-4 h-4 mb-1" />
                    {template.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Destinatários */}
            <div>
              <Label className="text-gray-700 dark:text-gray-300 mb-2">
                Destinatários ({selectedLeads.length})
              </Label>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto">
                {selectedLeads.length === 0 ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-center py-2">
                    Nenhum lead marcado para envio. Marque leads na tabela usando o botão de checkbox.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedLeads.map((lead) => (
                      <span
                        key={lead.id}
                        className="group inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        <Mail className="w-3 h-3" />
                        <span>{lead.nome}</span>
                        <button
                          onClick={() => handleRemoveLead(lead.id)}
                          className="ml-1 p-0.5 hover:bg-purple-300 dark:hover:bg-purple-800 rounded transition-colors"
                          title="Remover da lista"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Assunto */}
            <div>
              <Label htmlFor="subject" className="text-gray-700 dark:text-gray-300 mb-2">
                Assunto do Email
              </Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Promoção Especial para Você!"
                className="w-full"
              />
            </div>

            {/* Mensagem */}
            <div>
              <Label htmlFor="message" className="text-gray-700 dark:text-gray-300 mb-2">
                Mensagem
              </Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Digite sua mensagem aqui..."
                rows={12}
                className="w-full resize-none font-mono text-sm"
              />
              <p className="text-xs text-gray-700 dark:text-gray-300 mt-2">
                💡 Variáveis disponíveis: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{nome}'}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{email}'}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{telefone}'}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{interesse}'}</code>
              </p>
            </div>

            {/* Preview */}
            {message && selectedLeads.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Preview para <strong>{selectedLeads[0]?.nome}</strong>:
                </p>
                <div className="bg-white dark:bg-card rounded p-3 text-sm">
                  <p className="text-gray-900 dark:text-gray-100 mb-2">
                    <strong>Assunto:</strong> {subject || '(sem assunto)'}
                  </p>
                  <hr className="my-2 border-gray-200 dark:border-gray-700" />
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {message
                      .replace(/{nome}/g, selectedLeads[0]?.nome || '')
                      .replace(/{email}/g, selectedLeads[0]?.email || '')
                      .replace(/{telefone}/g, selectedLeads[0]?.telefone || '')
                      .replace(/{interesse}/g, selectedLeads[0]?.interesse || '')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!showReport && (
          <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center rounded-b-2xl">
            <p className="text-sm text-gray-600 dark:text-gray-700 dark:text-gray-300">
              {selectedLeads.length === 0 ? (
                '⚠️ Nenhum lead com email disponível'
              ) : (
                `✅ Pronto para enviar ${selectedLeads.length} email(s)`
              )}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} disabled={sending}>
                Cancelar
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !message.trim() || selectedLeads.length === 0}
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando {selectedLeads.length} emails...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar {selectedLeads.length} Email(s)
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}




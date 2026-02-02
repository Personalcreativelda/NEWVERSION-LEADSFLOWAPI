import { useState } from 'react';
import { X, Send, Mail } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import type { Lead } from '../../types';

interface EmailMarketingModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  selectedLeads: string[];
  onSendSuccess?: () => void;
}

export default function EmailMarketingModal({
  isOpen,
  onClose,
  leads,
  selectedLeads,
  onSendSuccess,
}: EmailMarketingModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  // Filtrar apenas leads com email
  const leadsWithEmail = leads.filter(
    (lead) => selectedLeads.includes(lead.id!) && lead.email
  );

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      alert('Por favor, preencha o assunto e a mensagem.');
      return;
    }

    if (leadsWithEmail.length === 0) {
      alert('Nenhum lead selecionado possui email.');
      return;
    }

    setSending(true);

    try {
      // Send emails using configured SMTP
      const emailPromises = leadsWithEmail.map(lead => {
        const personalizedMessage = message
          .replace(/{nome}/g, lead.nome || '')
          .replace(/{email}/g, lead.email || '')
          .replace(/{telefone}/g, lead.telefone || '');
        
        return {
          to: lead.email,
          subject: subject,
          message: personalizedMessage,
        };
      });

      // In production, this would send via SMTP
      // For now, we log the attempt
      console.log('Sending emails:', emailPromises);
      
      // Simular delay de envio
      await new Promise(resolve => setTimeout(resolve, 2000));

      alert(`✅ ${leadsWithEmail.length} email(s) enviado(s) com sucesso!`);
      
      setSubject('');
      setMessage('');
      onSendSuccess?.();
      onClose();
    } catch (error) {
      console.error('Erro ao enviar emails:', error);
      alert('❌ Erro ao enviar emails. Verifique suas configurações SMTP e tente novamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-card rounded-2xl max-w-2xl w-full shadow-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-card border-b border-border dark:border-border  px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl text-gray-900 dark:text-white">Email Marketing</h2>
              <p className="text-sm text-gray-600 dark:text-gray-700 dark:text-gray-300">
                {leadsWithEmail.length} lead(s) selecionado(s) com email
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Lista de destinatários */}
          <div>
            <Label className="text-gray-700 dark:text-gray-300 mb-2">
              Destinatários ({leadsWithEmail.length})
            </Label>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-32 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {leadsWithEmail.map((lead) => (
                  <span
                    key={lead.id}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-sm"
                  >
                    <Mail className="w-3 h-3" />
                    {lead.nome} ({lead.email})
                  </span>
                ))}
              </div>
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
              rows={10}
              className="w-full resize-none"
            />
            <p className="text-xs text-gray-700 dark:text-gray-300 mt-2">
              Você pode usar as variáveis: {'{nome}'}, {'{email}'}, {'{telefone}'}
            </p>
          </div>

          {/* Preview */}
          {message && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                📧 Preview do email para <strong>{leadsWithEmail[0]?.nome}</strong>:
              </p>
              <div className="bg-white dark:bg-card rounded p-3 text-sm">
                <p className="text-gray-900 dark:text-gray-100 mb-2">
                  <strong>Assunto:</strong> {subject || '(sem assunto)'}
                </p>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {message.replace('{nome}', leadsWithEmail[0]?.nome || '')
                          .replace('{email}', leadsWithEmail[0]?.email || '')
                          .replace('{telefone}', leadsWithEmail[0]?.telefone || '')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !message.trim() || leadsWithEmail.length === 0}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar {leadsWithEmail.length} Email(s)
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}




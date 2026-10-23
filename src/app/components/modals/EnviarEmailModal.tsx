import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { Mail, X, Send } from 'lucide-react';
import { AppButton } from '../base/AppButton';
import { FormField } from '../base/FormField';

interface EnviarEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadNome: string;
  leadEmail: string;
  onSend?: (assunto: string, mensagem: string) => Promise<void>;
}

export default function EnviarEmailModal({ 
  isOpen, 
  onClose, 
  leadNome, 
  leadEmail,
  onSend 
}: EnviarEmailModalProps) {
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!assunto.trim()) {
      toast.error('Por favor, preencha o assunto do email');
      return;
    }

    if (!mensagem.trim()) {
      toast.error('Por favor, escreva uma mensagem');
      return;
    }

    setLoading(true);

    try {
      // Simular envio de email
      await new Promise(resolve => setTimeout(resolve, 1500));

      if (onSend) {
        await onSend(assunto, mensagem);
      }

      toast.success(`Email enviado para ${leadNome}!`);
      handleClose();
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      toast.error('Erro ao enviar email. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAssunto('');
    setMensagem('');
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-card text-foreground max-w-lg w-full shadow-xl border border-border animate-in zoom-in-95 duration-200">

        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Mail className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <DialogTitle className="text-lg text-foreground">Enviar Email</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Para: {leadNome}</p>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Enviar email individual para o lead
          </DialogDescription>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
            disabled={loading}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </DialogHeader>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          
          {/* Info do Lead */}
          <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-purple-600" />
              <div className="flex-1">
                <p className="text-xs text-purple-900 font-medium">{leadNome}</p>
                <p className="text-xs text-purple-700">{leadEmail}</p>
              </div>
            </div>
          </div>

          {/* Assunto */}
          <FormField label="Assunto" htmlFor="assunto">
            <Input
              id="assunto"
              type="text"
              placeholder="Ex: Proposta comercial - LeadsFlow"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              disabled={loading}
              className="w-full"
            />
          </FormField>

          {/* Mensagem */}
          <FormField label="Mensagem" htmlFor="mensagem" hint={`${mensagem.length} caracteres`}>
            <Textarea
              id="mensagem"
              placeholder={`Olá ${leadNome},\n\nEspero que esteja bem!\n\nGostaria de...`}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              disabled={loading}
              rows={8}
              className="w-full resize-none"
            />
          </FormField>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex gap-3 justify-end">
          <AppButton
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancelar
          </AppButton>
          <AppButton
            onClick={handleSend}
            disabled={loading || !assunto.trim() || !mensagem.trim()}
            loading={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading ? (
              'A enviar...'
            ) : (
              <>
                <Send />
                Enviar Email
              </>
            )}
          </AppButton>
        </div>

      </DialogContent>
    </Dialog>
  );
}




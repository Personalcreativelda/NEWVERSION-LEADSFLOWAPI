import { useState } from 'react';
import { AppModal } from '../base/AppModal';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { Mail, Send } from 'lucide-react';
import { AppButton } from '../base/AppButton';
import { FormField } from '../base/FormField';
import { LogoBox } from '../base/LogoBox';

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
    <AppModal
      open={isOpen}
      onOpenChange={(open) => { if (!open && !loading) handleClose(); }}
      logo={<LogoBox icon={Mail} tone="text-cyan-600 dark:text-cyan-400" />}
      title="Enviar email"
      description={<span className="break-all">Para: {leadNome}{leadEmail ? ` · ${leadEmail}` : ''}</span>}
      bodyClassName="space-y-4"
      footer={
        <>
          <AppButton variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </AppButton>
          <AppButton
            onClick={handleSend}
            disabled={loading || !assunto.trim() || !mensagem.trim()}
            loading={loading}
          >
            {loading ? 'A enviar...' : (
              <>
                <Send />
                Enviar email
              </>
            )}
          </AppButton>
        </>
      }
    >
      <FormField label="Assunto" htmlFor="assunto">
        <Input
          id="assunto"
          type="text"
          placeholder="Ex: Proposta comercial"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          disabled={loading}
          className="w-full"
        />
      </FormField>

      <FormField label="Mensagem" htmlFor="mensagem" hint={`${mensagem.length} caracteres`}>
        <Textarea
          id="mensagem"
          placeholder={`Olá ${leadNome},

Espero que esteja bem!

Gostaria de...`}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          disabled={loading}
          rows={8}
          className="w-full resize-none"
        />
      </FormField>
    </AppModal>
  );
}

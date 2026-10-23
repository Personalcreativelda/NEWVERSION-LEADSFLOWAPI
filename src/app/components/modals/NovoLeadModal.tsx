import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Lead } from '../../types';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { FormField } from '../base/FormField';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

interface NovoLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lead: Omit<Lead, 'id'>) => Promise<boolean>;
}

const initialFormData = {
  nome: '',
  email: '',
  telefone: '',
  interesse: '',
  origem: '',
  status: 'novo',
  agente_atual: '',
  observacao: '',
  valor: '',
};

export default function NovoLeadModal({ isOpen, onClose, onSave }: NovoLeadModalProps) {
  const [formData, setFormData] = useState<any>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));

    // Validar telefone em tempo real
    if (name === 'telefone') {
      validatePhone(value);
    }
  };

  const validatePhone = (phone: string) => {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

    if (!cleanPhone) {
      setPhoneError('');
      return false;
    }

    if (cleanPhone.length < 10) {
      setPhoneError('Telefone muito curto. Inclua o código do país.');
      return false;
    }

    if (!cleanPhone.match(/^[+]?\d+$/)) {
      setPhoneError('Use apenas números e opcionalmente + no início');
      return false;
    }

    if (cleanPhone.startsWith('0')) {
      setPhoneError('Adicione o código do país (ex: 258 para Moçambique)');
      return false;
    }

    if (cleanPhone.length < 11 && !cleanPhone.startsWith('+')) {
      setPhoneError('Adicione o código do país (ex: 258 para Moçambique)');
      return false;
    }

    setPhoneError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePhone(formData.telefone)) {
      setPhoneError('Telefone deve incluir código do país (ex: 258840000000 ou +258840000000)');
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      const leadComData = {
        ...formData,
        data: new Date().toISOString().split('T')[0],
        valor: formData.valor ? parseFloat(formData.valor) : undefined,
      };

      console.log('[NovoLeadModal] Submitting lead data:', leadComData);
      const resultado = await onSave(leadComData);
      console.log('[NovoLeadModal] Save result:', resultado);

      if (resultado) {
        setSuccess(true);
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        console.error('[NovoLeadModal] Save returned false');
      }
    } catch (error) {
      console.error('[NovoLeadModal] Erro ao salvar lead:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setSuccess(false);
    setPhoneError('');
    onClose();
  };

  return (
    <AppModal
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      title="➡ Adicionar Novo Lead"
      size="lg"
      footer={
        <>
          <AppButton type="button" variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </AppButton>
          <AppButton type="submit" onClick={handleSubmit} loading={loading}>
            {loading ? 'A guardar...' : 'Guardar Lead'}
          </AppButton>
        </>
      }
    >
      {success && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
          <Check className="w-5 h-5" />
          <span>Lead adicionado com sucesso! ✓</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nome e Email */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Nome Completo" required>
            <Input name="nome" value={formData.nome} onChange={handleChange} required placeholder="Ex: João Silva" />
          </FormField>

          <FormField label="Email">
            <Input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="joao@email.com" />
          </FormField>
        </div>

        {/* Telefone e Interesse */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Telefone"
            required
            error={phoneError}
            hint="Obrigatório incluir código do país (ex: 258 para Moçambique)"
          >
            <Input
              type="tel"
              name="telefone"
              value={formData.telefone}
              onChange={handleChange}
              required
              aria-invalid={!!phoneError}
              placeholder="258840000000 ou +258840000000"
            />
          </FormField>

          <FormField label="Interesse" required>
            <Input name="interesse" value={formData.interesse} onChange={handleChange} required placeholder="Ex: Máquina de corte a laser" />
          </FormField>
        </div>

        {/* Origem e Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Origem" required>
            <select
              name="origem"
              value={formData.origem}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground"
            >
              <option value="">Selecione...</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="site">Site</option>
              <option value="indicacao">Indicação</option>
              <option value="outros">Outros</option>
            </select>
          </FormField>

          <FormField label="Estado" required>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground"
            >
              <option value="novo">Novo</option>
              <option value="qualificado">Qualificado</option>
              <option value="em_negociacao">Em Negociação</option>
              <option value="aguardando_resposta">A aguardar Resposta</option>
              <option value="convertido">Convertido</option>
              <option value="perdido">Perdido</option>
            </select>
          </FormField>
        </div>

        {/* Agente Responsável e Valor do Negócio */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Agente Responsável">
            <Input name="agente_atual" value={formData.agente_atual} onChange={handleChange} placeholder="Ex: Maria Silva" />
          </FormField>

          <FormField label="Valor do Negócio (R$)" hint="Usado para calcular valor médio de conversão">
            <Input
              type="number"
              name="valor"
              value={formData.valor}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="Ex: 2500.00"
            />
          </FormField>
        </div>

        {/* Observações */}
        <FormField label="Observações">
          <Textarea
            name="observacao"
            value={formData.observacao}
            onChange={handleChange}
            rows={4}
            placeholder="Adicione notas sobre este lead..."
          />
        </FormField>
      </form>
    </AppModal>
  );
}

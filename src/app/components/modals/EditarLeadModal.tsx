import { useState, useEffect } from 'react';
import { Check, Camera } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import AvatarUploadModal from './AvatarUploadModal';
import { toast } from 'sonner';
import type { Lead } from '../../types';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { FormField } from '../base/FormField';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

// Default funnel stages (fallback)
const DEFAULT_FUNNEL_STAGES = [
  { id: 'novo', label: 'Novo' },
  { id: 'qualificado', label: 'Qualificado' },
  { id: 'em_negociacao', label: 'Em Negociação' },
  { id: 'aguardando_resposta', label: 'A aguardar Resposta' },
  { id: 'convertido', label: 'Convertido' },
  { id: 'perdido', label: 'Perdido' },
];

// Load funnel stages from localStorage (synced with SalesFunnel)
const loadFunnelStages = () => {
  try {
    const saved = localStorage.getItem('funnelStages');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((stage: any) => ({
        id: stage.id,
        label: stage.label,
      }));
    }
  } catch (e) {
    console.error('Error loading funnel stages:', e);
  }
  return DEFAULT_FUNNEL_STAGES;
};

// Cores de avatar baseadas no nome
const AVATAR_COLORS = [
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-green-500', text: 'text-white' },
  { bg: 'bg-purple-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
  { bg: 'bg-yellow-500', text: 'text-white' },
  { bg: 'bg-red-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
];

const getInitials = (name: string): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
};

const getAvatarColor = (name: string): { bg: string; text: string } => {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

interface EditarLeadModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSave: (leadAtualizado: Lead) => Promise<void>;
}

const emptyLead: Lead = {
  id: '',
  nome: '',
  telefone: '',
  interesse: '',
  origem: '',
  status: 'novo',
  agente_atual: '',
  observacoes: '',
} as Lead;

export default function EditarLeadModal({ isOpen, lead, onClose, onSave }: EditarLeadModalProps) {
  const [formData, setFormData] = useState<Lead>(emptyLead);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);

  // Carregar dados do lead quando abrir o modal
  useEffect(() => {
    if (isOpen && lead) {
      setFormData({ ...lead });
    }
  }, [isOpen, lead]);

  if (!lead) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    try {
      await onSave(formData);
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      console.error('Erro ao editar lead:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(emptyLead);
    setSuccess(false);
    onClose();
  };

  return (
    <>
      <AppModal
        open={isOpen}
        onOpenChange={(open) => !open && handleClose()}
        size="lg"
        title={
          <div className="flex items-center gap-4">
            {/* Avatar clicável */}
            <div
              className="relative group cursor-pointer"
              onClick={() => setShowAvatarUpload(true)}
              title="Clique para alterar avatar"
            >
              <Avatar className="w-14 h-14">
                {formData.avatarUrl ? <AvatarImage src={formData.avatarUrl} alt={formData.nome} /> : null}
                <AvatarFallback className={`${getAvatarColor(formData.nome).bg} ${getAvatarColor(formData.nome).text} text-lg font-semibold`}>
                  {getInitials(formData.nome)}
                </AvatarFallback>
              </Avatar>
              {/* Overlay de upload no hover */}
              <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <span>Editar Contacto</span>
          </div>
        }
        footer={
          <>
            <AppButton type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </AppButton>
            <AppButton type="submit" onClick={handleSubmit} loading={loading}>
              {loading ? 'A guardar...' : 'Guardar Alterações'}
            </AppButton>
          </>
        }
      >
        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
            <Check className="w-5 h-5" />
            <span>Lead atualizado com sucesso! ✓</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nome e Telefone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Nome Completo" required>
              <Input name="nome" value={formData.nome} onChange={handleChange} required placeholder="Ex: João Silva" />
            </FormField>

            <FormField label="Telefone" required>
              <Input type="tel" name="telefone" value={formData.telefone} onChange={handleChange} required placeholder="258840000000" />
            </FormField>
          </div>

          {/* Interesse e Origem */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Interesse" required>
              <Input name="interesse" value={formData.interesse} onChange={handleChange} required placeholder="Ex: Máquina de corte a laser" />
            </FormField>

            <FormField label="Origem" required>
              <select
                name="origem"
                value={formData.origem}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-card text-foreground [&>option]:bg-card [&>option]:text-foreground"
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
          </div>

          {/* Status e Agente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Estado" required>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-card text-foreground [&>option]:bg-card [&>option]:text-foreground"
              >
                {loadFunnelStages().map((stage: { id: string; label: string }) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Agente Responsável">
              <Input name="agente_atual" value={formData.agente_atual || ''} onChange={handleChange} placeholder="Ex: Maria Silva" />
            </FormField>
          </div>

          {/* Valor do Negócio */}
          <FormField label="Valor do Negócio (R$)" hint="Preencha ao converter o lead para calcular valor médio">
            <Input
              type="number"
              name="valor"
              value={formData.valor || ''}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="Ex: 2500.00"
            />
          </FormField>

          {/* Observações */}
          <FormField label="Observações">
            <Textarea
              name="observacoes"
              value={formData.observacoes || ''}
              onChange={handleChange}
              rows={4}
              placeholder="Adicione notas sobre este lead..."
            />
          </FormField>
        </form>
      </AppModal>

      {/* Modal de upload de avatar */}
      <AvatarUploadModal
        isOpen={showAvatarUpload}
        onClose={() => setShowAvatarUpload(false)}
        leadId={formData.id}
        currentAvatarUrl={formData.avatarUrl}
        onAvatarUpdated={(newUrl) => {
          setFormData((prev) => ({ ...prev, avatarUrl: newUrl }));
          setShowAvatarUpload(false);
          toast.success('Avatar atualizado!');
        }}
        isDark={document.documentElement.classList.contains('dark')}
      />
    </>
  );
}

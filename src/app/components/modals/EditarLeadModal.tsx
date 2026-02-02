import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Camera } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import AvatarUploadModal from './AvatarUploadModal';
import { toast } from 'sonner';
import type { Lead } from '../../types';

// Default funnel stages (fallback)
const DEFAULT_FUNNEL_STAGES = [
  { id: 'novo', label: 'Novo' },
  { id: 'qualificado', label: 'Qualificado' },
  { id: 'em_negociacao', label: 'Em Negociação' },
  { id: 'aguardando_resposta', label: 'Aguardando Resposta' },
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

// Obter iniciais do nome
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

// Obter cor do avatar baseada no nome
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

export default function EditarLeadModal({ isOpen, lead, onClose, onSave }: EditarLeadModalProps) {
  const [formData, setFormData] = useState<Lead>({
    id: '',
    nome: '',
    telefone: '',
    interesse: '',
    origem: '',
    status: 'novo',
    agente_atual: '',
    observacoes: '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);

  // Carregar dados do lead quando abrir o modal
  useEffect(() => {
    if (isOpen && lead) {
      setFormData({ ...lead });
    }
  }, [isOpen, lead]);

  if (!isOpen || !lead) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    try {
      await onSave(formData);

      setSuccess(true);

      // Fechar modal após 1.5s
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
    setFormData({
      id: '',
      nome: '',
      telefone: '',
      interesse: '',
      origem: '',
      status: 'novo',
      agente_atual: '',
      observacoes: '',
    });
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[hsl(var(--background))] dark:bg-[hsl(var(--background))] transition-colors" />
      <div className="relative bg-card text-card-foreground rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl dark:shadow-purple-500/20 border border-border animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex justify-between items-center sticky top-0 bg-[hsl(var(--card))] z-10 transition-colors">
          <div className="flex items-center gap-4">
            {/* Avatar clicável */}
            <div
              className="relative group cursor-pointer"
              onClick={() => setShowAvatarUpload(true)}
              title="Clique para alterar avatar"
            >
              <Avatar className="w-14 h-14">
                {formData.avatarUrl ? (
                  <AvatarImage src={formData.avatarUrl} alt={formData.nome} />
                ) : null}
                <AvatarFallback
                  className={`${getAvatarColor(formData.nome).bg} ${getAvatarColor(formData.nome).text} text-lg font-semibold`}
                >
                  {getInitials(formData.nome)}
                </AvatarFallback>
              </Avatar>
              {/* Overlay de upload no hover */}
              <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <h2 className="text-xl text-foreground dark:text-foreground font-semibold">✏️ Editar Contacto</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-lg hover:bg-muted dark:hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground dark:text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {success && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>Lead atualizado com sucesso! ✓</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Nome e Telefone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground"
                  placeholder="Ex: João Silva"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="telefone"
                  value={formData.telefone}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground"
                  placeholder="258840000000"
                />
              </div>
            </div>

            {/* Interesse e Origem */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                  Interesse <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="interesse"
                  value={formData.interesse}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground"
                  placeholder="Ex: Máquina de corte a laser"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                  Origem <span className="text-red-500">*</span>
                </label>
                <select
                  name="origem"
                  value={formData.origem}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-card text-foreground [&>option]:bg-card [&>option]:text-foreground"
                >
                  <option value="">Selecione...</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="site">Site</option>
                  <option value="indicacao">Indicação</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
            </div>

            {/* Status e Agente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-card text-foreground [&>option]:bg-card [&>option]:text-foreground"
                >
                  {loadFunnelStages().map((stage: { id: string; label: string }) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                  Agente Responsável
                </label>
                <input
                  type="text"
                  name="agente_atual"
                  value={formData.agente_atual || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground"
                  placeholder="Ex: Maria Silva"
                />
              </div>
            </div>

            {/* Valor do Negócio */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                💰 Valor do Negócio (R$)
              </label>
              <input
                type="number"
                name="valor"
                value={formData.valor || ''}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground"
                placeholder="Ex: 2500.00"
              />
              <p className="text-muted-foreground dark:text-muted-foreground text-xs mt-1">
                💡 Preencha ao converter o lead para calcular valor médio
              </p>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-2">
                Observações
              </label>
              <textarea
                name="observacoes"
                value={formData.observacoes || ''}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2.5 border border-border dark:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none bg-input-background dark:bg-input text-foreground dark:text-foreground"
                placeholder="Adicione notas sobre este lead..."
              />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border dark:border-border flex gap-3 justify-end sticky bottom-0 bg-[hsl(var(--card))] transition-colors">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              <>💾 Salvar Alterações</>
            )}
          </Button>
        </div>

      </div>

      {/* Modal de upload de avatar */}
      <AvatarUploadModal
        isOpen={showAvatarUpload}
        onClose={() => setShowAvatarUpload(false)}
        leadId={formData.id}
        currentAvatarUrl={formData.avatarUrl}
        onAvatarUpdated={(newUrl) => {
          setFormData(prev => ({ ...prev, avatarUrl: newUrl }));
          setShowAvatarUpload(false);
          toast.success('Avatar atualizado!');
        }}
        isDark={document.documentElement.classList.contains('dark')}
      />
    </div>
  );
}







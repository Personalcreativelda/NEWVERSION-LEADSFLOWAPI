import { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import type { WebhookConfig } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: WebhookConfig;
  onSave: (config: WebhookConfig) => void;
  userEmail: string;
}

export default function SettingsModal({ isOpen, onClose, currentConfig, onSave, userEmail }: SettingsModalProps) {
  const [config, setConfig] = useState<WebhookConfig>(currentConfig);
  const [success, setSuccess] = useState(false);
  const inputClass =
    "w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-input-background dark:bg-input text-foreground dark:text-foreground placeholder:text-muted-foreground";

  useEffect(() => {
    if (isOpen) {
      setConfig(currentConfig);
      setSuccess(false);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  const handleChange = (field: keyof WebhookConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    try {
      // Salvar configurações específicas do usuário
      const todasConfigs = JSON.parse(localStorage.getItem('crm_todas_configuracoes') || '{}');
      todasConfigs[userEmail] = config;
      localStorage.setItem('crm_todas_configuracoes', JSON.stringify(todasConfigs));

      onSave(config);
      setSuccess(true);

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      alert('Erro ao salvar configurações');
    }
  };

  const handleTest = () => {
    let configurados = 0;
    const total = 6;

    Object.values(config).forEach(value => {
      if (value && value.trim() !== '') {
        configurados++;
      }
    });

    if (configurados === 0) {
      alert('❌ Nenhum webhook configurado!\n\nConfigure pelo menos um webhook para começar a usar o sistema.');
    } else if (configurados < total) {
      alert(`⚠️ Configuração parcial!\n\n${configurados} de ${total} webhooks configurados.\n\nAlgumas funcionalidades podem não estar disponíveis.`);
    } else {
      alert('✅ Todos os webhooks configurados!\n\nO sistema está pronto para uso completo.');
    }
  };

  const getStatusBadge = (value: string) => {
    if (value && value.trim() !== '') {
      return (
        <span className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-md">
          ✓ Configurado
        </span>
      );
    }
    return (
      <span className="ml-2 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs rounded-md">
        ⚠ Não configurado
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-[hsl(var(--background))] dark:bg-[hsl(var(--background))] transition-colors" />
      <div className="relative bg-card text-card-foreground rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-border animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex justify-between items-center sticky top-0 bg-[hsl(var(--card))] z-10">
          <h2 className="text-xl text-foreground">⚙️ Configurações do Sistema</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-6">
          
          {/* Alert Info */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-200">
              Configure as URLs dos webhooks do N8N e a instância Evolution API para integração completa do sistema.
            </div>
          </div>

          {success && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>Configurações salvas com sucesso! ✓</span>
            </div>
          )}

          <form className="space-y-6">
            
            {/* Seção: Gestão de Leads */}
            <div>
              <h4 className="text-foreground mb-4 font-semibold">📡 Webhooks N8N - Gestão de Leads</h4>
              
              <div className="space-y-4">
                {/* Cadastrar */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    🆕 Webhook - Cadastrar Novo Lead
                    {getStatusBadge(config.cadastrar)}
                  </label>
                  <input
                    type="url"
                    value={config.cadastrar}
                    onChange={(e) => handleChange('cadastrar', e.target.value)}
                    className={inputClass}
                    placeholder="https://seu-n8n.com/webhook/novo-lead"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Endpoint POST para criar novos leads na planilha</p>
                </div>

                {/* Editar */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    ✏️ Webhook - Editar Lead
                    {getStatusBadge(config.editar)}
                  </label>
                  <input
                    type="url"
                    value={config.editar}
                    onChange={(e) => handleChange('editar', e.target.value)}
                    className={inputClass}
                    placeholder="https://seu-n8n.com/webhook/editar-lead"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Endpoint PUT para atualizar leads existentes</p>
                </div>

                {/* Deletar */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    🗑️ Webhook - Deletar Lead
                    {getStatusBadge(config.deletar)}
                  </label>
                  <input
                    type="url"
                    value={config.deletar}
                    onChange={(e) => handleChange('deletar', e.target.value)}
                    className={inputClass}
                    placeholder="https://seu-n8n.com/webhook/deletar-lead"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Endpoint DELETE para remover leads da planilha</p>
                </div>

                {/* Listar */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    📋 Webhook - Listar Todos os Leads
                    {getStatusBadge(config.listar)}
                  </label>
                  <input
                    type="url"
                    value={config.listar}
                    onChange={(e) => handleChange('listar', e.target.value)}
                    className={inputClass}
                    placeholder="https://seu-n8n.com/webhook/listar-leads"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Endpoint GET para carregar todos os leads da planilha</p>
                </div>
              </div>
            </div>

            {/* Seção: WhatsApp */}
            <div>
              <h4 className="text-foreground mb-4 pt-4 border-t border-border font-semibold">💬 Webhooks N8N - WhatsApp</h4>
              
              <div className="space-y-4">
                {/* Enviar Mensagem */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    💬 Webhook - Enviar Mensagem Individual
                    {getStatusBadge(config.enviarMsg)}
                  </label>
                  <input
                    type="url"
                    value={config.enviarMsg}
                    onChange={(e) => handleChange('enviarMsg', e.target.value)}
                    className={inputClass}
                    placeholder="https://seu-n8n.com/webhook/enviar-mensagem"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Endpoint POST para enviar mensagem individual via WhatsApp</p>
                </div>

                {/* Enviar em Massa */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    📤 Webhook - Enviar Mensagem em Massa
                    {getStatusBadge(config.enviarMassa)}
                  </label>
                  <input
                    type="url"
                    value={config.enviarMassa}
                    onChange={(e) => handleChange('enviarMassa', e.target.value)}
                    className={inputClass}
                    placeholder="https://seu-n8n.com/webhook/enviar-massa"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Endpoint POST para enviar mensagens em massa via WhatsApp</p>
                </div>
              </div>

              {/* Info adicional */}
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-200">
                  <strong>Como funciona:</strong> Os webhooks de WhatsApp são processados pelo N8N que se conecta com a Evolution API ou outra API de WhatsApp de sua preferência.
                </div>
              </div>
            </div>

            {/* Dica Final */}
            <div className="p-4 bg-muted border border-border rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <strong>Dica:</strong> Configure primeiro os webhooks N8N e depois a Evolution API para ter todas as funcionalidades ativas.
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end sticky bottom-0 bg-[hsl(var(--card))]">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
          >
            🧪 Testar Webhooks
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            💾 Salvar Configurações
          </Button>
        </div>

      </div>
    </div>
  );
}




import { useState, useEffect } from 'react';
import { X, Check, Crown, Rocket, Zap, Switch as SwitchIcon, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { projectId } from '../../utils/supabase/info';
import type { Lead } from '../../types';

interface MassMessageModalProps {
  isOpen: boolean;
  leads: Lead[];
  onClose: () => void;
  webhookUrl: string;
  userPlan?: 'free' | 'business' | 'enterprise';
  onUpgrade?: () => void;
}

const TEMPLATES = {
  saudacao: 'Olá {nome}! 👋\n\nEspero que esteja tudo bem! Sou da PersonalCreativeMZ e vi que você tem interesse em {interesse}.\n\nGostaria de saber mais sobre suas necessidades?',
  followup: 'Oi {nome}! 😊\n\nEstou entrando em contato para dar continuidade ao seu interesse em {interesse}.\n\nPodemos conversar sobre como podemos ajudar?',
  promocao: 'Olá {nome}! 🎁\n\nTemos uma oferta especial para {interesse} esta semana!\n\nGostaria de conhecer os detalhes?',
  agradecimento: 'Olá {nome}! 🙏\n\nMuito obrigado pelo seu interesse em nossos serviços!\n\nFico à disposição para qualquer dúvida sobre {interesse}.',
};

export default function MassMessageModal({ isOpen, leads, onClose, webhookUrl, userPlan, onUpgrade }: MassMessageModalProps) {
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [preview, setPreview] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ enviados: 0, falhas: 0 });
  const [useN8NWebhook, setUseN8NWebhook] = useState(false);

  // Check user plan permissions
  const isFree = !userPlan || userPlan === 'free';
  const isEnterprise = userPlan === 'enterprise';
  const canUseMassMessage = userPlan === 'business' || userPlan === 'enterprise';

  useEffect(() => {
    if (isOpen) {
      // Reset ao abrir
      setSelecionados([]);
      setMensagem('');
      setPreview('');
      setSuccess(false);
      setError('');
      setStats({ enviados: 0, falhas: 0 });
    }
  }, [isOpen]);

  useEffect(() => {
    // Atualizar preview
    if (mensagem && selecionados.length > 0) {
      const leadIndex = selecionados[0];
      const lead = leads[leadIndex];
      
      const previewText = mensagem
        .replace(/{nome}/g, lead?.nome || '[Nome do Lead]')
        .replace(/{interesse}/g, lead?.interesse || '[Interesse do Lead]');
      
      setPreview(previewText);
    } else if (mensagem) {
      const previewText = mensagem
        .replace(/{nome}/g, '[Nome do Lead]')
        .replace(/{interesse}/g, '[Interesse do Lead]');
      
      setPreview(previewText);
    } else {
      setPreview('Digite uma mensagem para ver o preview...');
    }
  }, [mensagem, selecionados, leads]);

  if (!isOpen) return null;

  const handleToggleLead = (index: number) => {
    setSelecionados(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleToggleAll = () => {
    if (selecionados.length === leads.length) {
      setSelecionados([]);
    } else {
      setSelecionados(leads.map((_, index) => index));
    }
  };

  const handleUseTemplate = (tipo: keyof typeof TEMPLATES) => {
    setMensagem(TEMPLATES[tipo]);
  };

  const handleEnviar = async () => {
    if (selecionados.length === 0) {
      alert('⚠️ Selecione pelo menos um lead!');
      return;
    }

    if (!mensagem.trim()) {
      alert('⚠️ Digite uma mensagem!');
      return;
    }

    if (!webhookUrl || webhookUrl.trim() === '') {
      alert('⚠️ Configure o webhook de envio em massa nas configurações!');
      return;
    }

    if (!confirm(`Confirma o envio de ${selecionados.length} mensagens?`)) {
      return;
    }

    setEnviando(true);
    setSuccess(false);
    setError('');

    // Preparar lista de leads para enviar
    const leadsParaEnviar = selecionados.map(index => {
      const lead = leads[index];
      const mensagemPersonalizada = mensagem
        .replace(/{nome}/g, lead.nome || 'Cliente')
        .replace(/{interesse}/g, lead.interesse || 'nossos produtos');

      return {
        nome: lead.nome,
        telefone: lead.telefone,
        mensagem: mensagemPersonalizada,
      };
    });

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leads: leadsParaEnviar,
          delay: 3000, // Delay entre mensagens em ms
        }),
      });

      if (!response.ok) {
        throw new Error('Erro no webhook');
      }

      const data = await response.json();

      setStats({
        enviados: data.enviados !== undefined ? data.enviados : selecionados.length,
        falhas: data.falhas || 0,
      });

      // Atualizar contador de mensagens WhatsApp em massa no backend
      const sentCount = data.enviados !== undefined ? data.enviados : selecionados.length;
      if (sentCount > 0) {
        try {
          const token = localStorage.getItem('leadflow_access_token');
          await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/increment-whatsapp-mass-usage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ messageCount: sentCount }),
          });
        } catch (error) {
          console.error('Erro ao atualizar contador de mensagens WhatsApp:', error);
        }
      }

      setSuccess(true);

      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err) {
      console.error('Erro ao enviar em massa:', err);
      setError('Erro ao processar envio em massa. Verifique se o webhook está configurado.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-lg dark:shadow-purple-500/20 dark:border dark:border-purple-500/30">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-purple-500/30 flex justify-between items-center sticky top-0 bg-white dark:bg-card backdrop-blur-sm z-10">
          <h2 className="text-xl text-gray-900 dark:text-white font-semibold">
            📢 Envio em Massa via WhatsApp
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-purple-500/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Upgrade Banner - Only for Free Plan */}
        {isFree && (
          <div className="mx-6 mt-6 mb-0">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-6 shadow-lg">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                  <Crown className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    🚀 Recurso Premium - Envio em Massa
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                    O <strong>Envio em Massa de Mensagens WhatsApp</strong> está disponível apenas nos planos <strong>Business</strong> e <strong>Enterprise</strong>.
                  </p>
                  <div className="bg-white dark:bg-card rounded-lg p-4 mb-4 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">
                      <strong>✨ Recursos inclusos:</strong>
                    </p>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 ml-4">
                      <li className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Business:</strong> Envio em massa ilimitado + Webhook N8N</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Rocket className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Enterprise:</strong> Tudo do Business + Webhook N8N dedicado</span>
                      </li>
                    </ul>
                  </div>
                  <Button
                    onClick={() => {
                      if (onUpgrade) {
                        onClose();
                        onUpgrade();
                      }
                    }}
                    className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-md"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Fazer Upgrade Agora
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className={`px-6 ${isFree ? 'py-4 opacity-50 pointer-events-none' : 'py-6'}`}>
          
          {/* Success/Error Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>Processo concluído! {stats.enviados} mensagens processadas. ✓</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Seletor de Leads */}
          <div className="mb-6">
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-3">
              📋 Selecione os Leads
            </label>

            {/* Select All */}
            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selecionados.length === leads.length}
                  onChange={handleToggleAll}
                  className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                />
                <strong className="text-sm text-gray-900 dark:text-white">Selecionar Todos</strong>
              </label>
            </div>

            {/* Lista de Leads */}
            <div className="border border-border dark:border-border rounded-lg max-h-48 overflow-y-auto p-2 bg-white dark:bg-card">
              {leads.map((lead, index) => (
                <label
                  key={index}
                  className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selecionados.includes(index)}
                    onChange={() => handleToggleLead(index)}
                    className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1 text-sm text-gray-900 dark:text-gray-200">
                    <strong>{lead.nome || 'Sem nome'}</strong> - {lead.telefone || 'Sem telefone'} ({lead.status || 'Sem status'})
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div className="mb-6">
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-3">
              📝 Templates Rápidos
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleUseTemplate('saudacao')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors text-sm text-gray-700 dark:text-gray-300"
              >
                👋 Saudação
              </button>
              <button
                onClick={() => handleUseTemplate('followup')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors text-sm text-gray-700 dark:text-gray-300"
              >
                📞 Follow-up
              </button>
              <button
                onClick={() => handleUseTemplate('promocao')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors text-sm text-gray-700 dark:text-gray-300"
              >
                🎁 Promoção
              </button>
              <button
                onClick={() => handleUseTemplate('agradecimento')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors text-sm text-gray-700 dark:text-gray-300"
              >
                🙏 Agradecimento
              </button>
            </div>
          </div>

          {/* Mensagem */}
          <div className="mb-6">
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
              💬 Mensagem
            </label>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 border border-input dark:border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm bg-input-background dark:bg-input-background text-foreground dark:text-foreground"
              placeholder="Digite a mensagem que será enviada para os leads selecionados...&#10;&#10;Use {nome} para personalizar com o nome do lead&#10;Use {interesse} para incluir o interesse do lead"
            />

            {/* Preview */}
            <div className="mt-3 bg-[#e5ddd5] dark:bg-gray-700 p-4 rounded-lg">
              <strong className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Preview:</strong>
              <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{preview}</div>
            </div>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
            <div className="text-center">
              <div className="text-2xl text-blue-600 dark:text-blue-400">{selecionados.length}</div>
              <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">Leads Selecionados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl text-green-600 dark:text-green-400">{stats.enviados}</div>
              <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">Enviados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl text-red-600 dark:text-red-400">{stats.falhas}</div>
              <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">Falhas</div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border dark:border-border flex gap-3 justify-end sticky bottom-0 bg-white dark:bg-card">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            onClick={isFree ? undefined : handleEnviar}
            disabled={enviando || isFree}
            className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFree ? (
              <>
                <Crown className="w-4 h-4 mr-2" />
                Recurso Premium
              </>
            ) : enviando ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              <>📤 Enviar Mensagens</>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}




import { X } from 'lucide-react';
import { Button } from '../ui/button';

interface Campaign {
  id: string;
  name: string;
  type: 'whatsapp' | 'email' | 'sms';
}

interface CampaignMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
}

export default function CampaignMessageModal({ isOpen, onClose, campaign }: CampaignMessageModalProps) {
  if (!isOpen || !campaign) return null;

  // Recuperar mensagem do localStorage (exemplo)
  const getCampaignMessage = () => {
    try {
      const campaignData = localStorage.getItem(`campaign_${campaign.id}_data`);
      if (campaignData) {
        const data = JSON.parse(campaignData);
        return data.message || 'Mensagem não disponível';
      }
    } catch (e) {
      console.error('Erro ao recuperar mensagem:', e);
    }
    return 'Olá {name}! Esta é uma mensagem de exemplo da campanha.';
  };

  const message = getCampaignMessage();

  const formatMessage = (text: string) => {
    // Aplicar formatação Markdown-like para WhatsApp
    let formatted = text;
    
    // Aplicar negrito
    formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    
    // Aplicar itálico
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Aplicar riscado
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    
    // Quebras de linha
    formatted = formatted.replace(/\n/g, '<br/>');
    
    return formatted;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#10B981] to-green-600 px-6 py-4 flex items-center justify-between text-white">
          <div>
            <h2 className="text-xl font-bold">Visualizar Mensagem</h2>
            <p className="text-sm text-green-100 mt-0.5">{campaign.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Pré-visualização no estilo WhatsApp */}
          {campaign.type === 'whatsapp' && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Pré-visualização WhatsApp</h3>
              <div className="bg-[#ECE5DD] rounded-lg p-4">
                <div className="bg-white rounded-lg shadow-sm p-4 max-w-md">
                  <div 
                    className="text-gray-800 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: formatMessage(message) }}
                  />
                  <div className="flex items-center justify-end gap-1 mt-2">
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <i className="fas fa-check-double text-blue-500 text-xs"></i>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pré-visualização Email */}
          {campaign.type === 'email' && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Pré-visualização Email</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-700 dark:text-gray-300">De:</span>
                    <span className="font-medium text-gray-900">noreply@leadsflow.com</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <span className="text-gray-700 dark:text-gray-300">Assunto:</span>
                    <span className="font-medium text-gray-900">{campaign.name}</span>
                  </div>
                </div>
                <div className="p-6 bg-white">
                  <div 
                    className="text-gray-800 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: formatMessage(message) }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mensagem Raw */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Mensagem Original</h3>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{message}</pre>
            </div>
          </div>

          {/* Info sobre variáveis */}
          {message.includes('{') && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
                <div>
                  <p className="text-sm font-medium text-blue-900 mb-1">Variáveis Personalizadas</p>
                  <p className="text-sm text-blue-700">
                    Esta mensagem contém variáveis que serão substituídas automaticamente para cada destinatário:
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.match(/\{[^}]+\}/g)?.map((variable, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end bg-gray-50">
          <Button onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}




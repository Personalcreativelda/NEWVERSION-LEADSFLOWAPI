import { X } from 'lucide-react';
import { Button } from '../ui/button';

interface Campaign {
  id: string;
  name: string;
  type: 'whatsapp' | 'email' | 'sms';
  template?: string;
  settings?: any;
  media_urls?: string[];
}

interface CampaignMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
}

export default function CampaignMessageModal({ isOpen, onClose, campaign }: CampaignMessageModalProps) {
  if (!isOpen || !campaign) return null;

  // Recuperar mensagem diretamente do campaign.settings
  const getCampaignMessage = (): string => {
    const settings = campaign.settings
      ? (typeof campaign.settings === 'string' ? JSON.parse(campaign.settings) : campaign.settings)
      : {};
    return settings.message || campaign.template || '';
  };

  const getEmailSubject = (): string => {
    const settings = campaign.settings
      ? (typeof campaign.settings === 'string' ? JSON.parse(campaign.settings) : campaign.settings)
      : {};
    return settings.subject || campaign.template || campaign.name;
  };

  const getEmailHtml = (): string | null => {
    const settings = campaign.settings
      ? (typeof campaign.settings === 'string' ? JSON.parse(campaign.settings) : campaign.settings)
      : {};
    return settings.htmlContent || null;
  };

  const getFromEmail = (): string => {
    const settings = campaign.settings
      ? (typeof campaign.settings === 'string' ? JSON.parse(campaign.settings) : campaign.settings)
      : {};
    const fromName = settings.fromName || 'LeadsFlow';
    const fromEmail = settings.fromEmail || 'noreply@leadsflow.com';
    return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  };

  const mediaUrls: string[] = (() => {
    if (campaign.media_urls && campaign.media_urls.length > 0) return campaign.media_urls;
    const settings = campaign.settings
      ? (typeof campaign.settings === 'string' ? JSON.parse(campaign.settings) : campaign.settings)
      : {};
    if (settings.attachments && Array.isArray(settings.attachments)) return settings.attachments;
    return [];
  })();

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
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
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Pré-visualização no estilo WhatsApp */}
          {campaign.type === 'whatsapp' && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-3">Pré-visualização WhatsApp</h3>
              <div className="bg-[#ECE5DD] rounded-lg p-4">
                <div className="bg-card rounded-lg shadow-sm p-4 max-w-md">
                  {/* Imagem/mídia anexada */}
                  {mediaUrls.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {mediaUrls.map((url, idx) => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
                        const isVideo = /\.(mp4|mov|avi|webm)(\?|$)/i.test(url);
                        if (isImage) {
                          return (
                            <img
                              key={idx}
                              src={url}
                              alt={`Mídia ${idx + 1}`}
                              className="w-full rounded-lg object-cover max-h-64"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          );
                        }
                        if (isVideo) {
                          return (
                            <video key={idx} src={url} controls className="w-full rounded-lg max-h-64" />
                          );
                        }
                        return (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm underline block truncate">
                            📎 {url.split('/').pop()}
                          </a>
                        );
                      })}
                    </div>
                  )}
                  {message ? (
                    <div
                      className="text-foreground whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: formatMessage(message) }}
                    />
                  ) : (
                    <p className="text-muted-foreground italic text-sm">Sem mensagem de texto</p>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-2">
                    <span className="text-xs text-foreground/80">
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
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-3">Pré-visualização Email</h3>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/50 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-foreground/80">De:</span>
                    <span className="font-medium text-foreground">{getFromEmail()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <span className="text-foreground/80">Assunto:</span>
                    <span className="font-medium text-foreground">{getEmailSubject()}</span>
                  </div>
                </div>
                <div className="p-6 bg-card">
                  {getEmailHtml() ? (
                    <div
                      className="text-foreground prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: getEmailHtml()! }}
                    />
                  ) : message ? (
                    <div
                      className="text-foreground whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: formatMessage(message) }}
                    />
                  ) : (
                    <p className="text-muted-foreground italic text-sm">Sem conteúdo de email</p>
                  )}
                  {/* Anexos */}
                  {mediaUrls.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-sm font-medium text-foreground/80 mb-2">Anexos:</p>
                      <div className="space-y-1">
                        {mediaUrls.map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm underline flex items-center gap-1">
                            📎 {url.split('/').pop() || `Anexo ${idx + 1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pré-visualização SMS */}
          {campaign.type === 'sms' && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-3">Pré-visualização SMS</h3>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 max-w-sm">
                <div className="bg-[#34C759] text-white rounded-2xl rounded-br-sm px-4 py-3 max-w-xs ml-auto">
                  {message ? (
                    <p className="text-sm whitespace-pre-wrap">{message}</p>
                  ) : (
                    <p className="text-sm italic opacity-75">Sem mensagem</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 text-right mt-1">
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )}

          {/* Mensagem Raw */}
          {message && (
            <div>
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-3">Mensagem Original</h3>
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-mono">{message}</pre>
              </div>
            </div>
          )}

          {/* Info sobre variáveis */}
          {message && message.includes('{') && (
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

          {/* Sem dados */}
          {!message && mediaUrls.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">Nenhum conteúdo disponível para esta campanha.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-end bg-muted/50">
          <Button onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}




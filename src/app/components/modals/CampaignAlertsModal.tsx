import { X, Bell } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
}

interface CampaignAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
}

export default function CampaignAlertsModal({ isOpen, onClose, campaign }: CampaignAlertsModalProps) {
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [notifyOnError, setNotifyOnError] = useState(true);
  const [notifyOn50Percent, setNotifyOn50Percent] = useState(false);
  const [notifyLowDelivery, setNotifyLowDelivery] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [whatsappNotifications, setWhatsappNotifications] = useState(true);

  if (!isOpen || !campaign) return null;

  const handleSave = () => {
    const alertsConfig = {
      campaignId: campaign.id,
      notifyOnComplete,
      notifyOnError,
      notifyOn50Percent,
      notifyLowDelivery,
      emailNotifications,
      whatsappNotifications,
    };

    // Salvar no localStorage
    localStorage.setItem(`campaign_${campaign.id}_alerts`, JSON.stringify(alertsConfig));
    
    toast.success('🔔 Alertas configurados com sucesso!');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#10B981] to-green-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Configurar Alertas</h2>
              <p className="text-sm text-green-100 mt-0.5">{campaign.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Eventos de Notificação */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground/80 mb-4">Quando notificar?</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={notifyOnComplete}
                  onChange={(e) => setNotifyOnComplete(e.target.checked)}
                  className="w-5 h-5 text-[#10B981] rounded focus:ring-2 focus:ring-[#10B981]"
                />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Campanha concluída</p>
                  <p className="text-sm text-foreground/80">Notificar quando a campanha terminar</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={notifyOnError}
                  onChange={(e) => setNotifyOnError(e.target.checked)}
                  className="w-5 h-5 text-[#10B981] rounded focus:ring-2 focus:ring-[#10B981]"
                />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Erros detectados</p>
                  <p className="text-sm text-foreground/80">Notificar quando houver falhas no envio</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={notifyOn50Percent}
                  onChange={(e) => setNotifyOn50Percent(e.target.checked)}
                  className="w-5 h-5 text-[#10B981] rounded focus:ring-2 focus:ring-[#10B981]"
                />
                <div className="flex-1">
                  <p className="font-medium text-foreground">50% de progresso</p>
                  <p className="text-sm text-foreground/80">Notificar quando atingir metade do envio</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={notifyLowDelivery}
                  onChange={(e) => setNotifyLowDelivery(e.target.checked)}
                  className="w-5 h-5 text-[#10B981] rounded focus:ring-2 focus:ring-[#10B981]"
                />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Taxa de entrega baixa</p>
                  <p className="text-sm text-foreground/80">Notificar se taxa de entrega cair abaixo de 80%</p>
                </div>
              </label>
            </div>
          </div>

          {/* Canais de Notificação */}
          <div>
            <h3 className="text-sm font-semibold text-foreground/80 mb-4">Como notificar?</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={whatsappNotifications}
                  onChange={(e) => setWhatsappNotifications(e.target.checked)}
                  className="w-5 h-5 text-[#10B981] rounded focus:ring-2 focus:ring-[#10B981]"
                />
                <div className="flex-1 flex items-center gap-3">
                  <i className="fab fa-whatsapp text-2xl text-[#25D366]"></i>
                  <div>
                    <p className="font-medium text-foreground">WhatsApp</p>
                    <p className="text-sm text-foreground/80">Receber notificações via WhatsApp</p>
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="w-5 h-5 text-[#10B981] rounded focus:ring-2 focus:ring-[#10B981]"
                />
                <div className="flex-1 flex items-center gap-3">
                  <i className="fas fa-envelope text-2xl text-blue-500"></i>
                  <div>
                    <p className="font-medium text-foreground">Email</p>
                    <p className="text-sm text-foreground/80">Receber notificações por email</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Info */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                As notificações serão enviadas de acordo com as preferências selecionadas. 
                Você pode alterar essas configurações a qualquer momento.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-end gap-3 bg-muted/50">
          <Button
            onClick={onClose}
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="bg-[#10B981] hover:bg-green-600 text-white"
          >
            Salvar Configurações
          </Button>
        </div>
      </div>
    </div>
  );
}




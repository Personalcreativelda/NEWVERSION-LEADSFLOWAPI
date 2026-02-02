import { X, AlertCircle, QrCode } from 'lucide-react';

interface WhatsAppNotConnectedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToSettings: () => void;
}

export default function WhatsAppNotConnectedModal({ 
  isOpen, 
  onClose,
  onGoToSettings 
}: WhatsAppNotConnectedModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-card rounded-2xl shadow-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border dark:border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-semibold text-foreground dark:text-foreground">
              WhatsApp Não Conectado
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted dark:hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground dark:text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <QrCode className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">Conecte sua conta do WhatsApp</p>
              <p>
                Para importar contatos do WhatsApp, você precisa primeiro conectar sua conta usando o QR Code na página de Configurações.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground dark:text-muted-foreground">
            <p className="font-medium text-foreground dark:text-foreground">Como conectar:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Vá para Configurações → Integrações</li>
              <li>Encontre a seção "WhatsApp / Evolution API"</li>
              <li>Escaneie o QR Code com seu WhatsApp</li>
              <li>Aguarde a confirmação de conexão</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border dark:border-border">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-foreground dark:text-foreground hover:bg-muted dark:hover:bg-muted rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onGoToSettings}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <QrCode className="w-4 h-4" />
            Ir para Configurações
          </button>
        </div>
      </div>
    </div>
  );
}




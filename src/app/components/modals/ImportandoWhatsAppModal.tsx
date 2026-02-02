import { Loader2 } from 'lucide-react';

interface ImportandoWhatsAppModalProps {
  isOpen: boolean;
}

export default function ImportandoWhatsAppModal({ isOpen }: ImportandoWhatsAppModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-card rounded-2xl p-8 max-w-md w-full shadow-lg">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Ícone Animado */}
          <div className="relative">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-green-600 dark:text-green-400 animate-spin" />
            </div>
            {/* Pulso de fundo */}
            <div className="absolute inset-0 w-20 h-20 bg-green-400 rounded-full animate-ping opacity-20"></div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Buscando contatos no WhatsApp
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-700 dark:text-gray-300">
              Aguarde alguns segundos enquanto sincronizamos seus contatos...
            </p>
          </div>

          {/* Barra de progresso animada */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full animate-pulse w-3/4"></div>
          </div>
        </div>
      </div>
    </div>
  );
}




import { CheckCircle, XCircle } from 'lucide-react';

interface DeletionSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  deletedCount: number;
  errorCount: number;
  totalBefore: number;
  totalAfter: number;
}

export default function DeletionSuccessModal({
  isOpen,
  onClose,
  deletedCount,
  errorCount,
  totalBefore,
  totalAfter,
}: DeletionSuccessModalProps) {
  if (!isOpen) return null;

  const isSuccess = errorCount === 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-lg max-w-md w-full p-8 animate-scale-in">
        {/* Ícone */}
        <div className="flex justify-center mb-6">
          {isSuccess ? (
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
            </div>
          ) : (
            <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
              <XCircle className="w-12 h-12 text-amber-600 dark:text-amber-400" />
            </div>
          )}
        </div>

        {/* Título */}
        <h2 className="text-center text-gray-900 dark:text-white mb-4">
          {isSuccess ? 'Deleção Concluída!' : 'Deleção Parcial'}
        </h2>

        {/* Mensagem */}
        <div className="text-center mb-6">
          {isSuccess ? (
            <p className="text-gray-600 dark:text-gray-500 dark:text-gray-400">
              <span className="text-green-600 dark:text-green-400">
                {deletedCount} lead(s)
              </span>{' '}
              foram deletados permanentemente do servidor.
            </p>
          ) : (
            <p className="text-gray-600 dark:text-gray-500 dark:text-gray-400">
              <span className="text-green-600 dark:text-green-400">
                {deletedCount} lead(s)
              </span>{' '}
              deletados,{' '}
              <span className="text-amber-600 dark:text-amber-400">
                {errorCount} erro(s)
              </span>
              .
            </p>
          )}
        </div>

        {/* Estatísticas */}
        <div className="bg-muted rounded-xl p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-500 dark:text-gray-400">Total antes:</span>
            <span className="text-gray-900 dark:text-white">{totalBefore} leads</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-500 dark:text-gray-400">Deletados:</span>
            <span className="text-red-600 dark:text-red-400">-{deletedCount} leads</span>
          </div>
          <div className="h-px bg-gray-200 dark:bg-gray-600"></div>
          <div className="flex justify-between">
            <span className="text-gray-900 dark:text-white">Total agora:</span>
            <span className="text-gray-900 dark:text-white">{totalAfter} leads</span>
          </div>
        </div>



        {/* Botão */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Entendi
        </button>
      </div>

      {/* CSS para animação */}
      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}


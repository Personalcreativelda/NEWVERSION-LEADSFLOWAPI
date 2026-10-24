import { CheckCircle, XCircle } from 'lucide-react';
import { OverlayModal } from '../base/OverlayModal';

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
    <OverlayModal onClose={onClose} stickyEdges={false} className="max-w-md p-8">
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
        <h2 className="text-center text-foreground mb-4">
          {isSuccess ? 'Deleção Concluída!' : 'Deleção Parcial'}
        </h2>

        {/* Mensagem */}
        <div className="text-center mb-6">
          {isSuccess ? (
            <p className="text-muted-foreground">
              <span className="text-green-600 dark:text-green-400">
                {deletedCount} lead(s)
              </span>{' '}
              foram apagados permanentemente do servidor.
            </p>
          ) : (
            <p className="text-muted-foreground">
              <span className="text-green-600 dark:text-green-400">
                {deletedCount} lead(s)
              </span>{' '}
              apagados,{' '}
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
            <span className="text-muted-foreground">Total antes:</span>
            <span className="text-foreground">{totalBefore} leads</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Apagados:</span>
            <span className="text-red-600 dark:text-red-400">-{deletedCount} leads</span>
          </div>
          <div className="h-px bg-border"></div>
          <div className="flex justify-between">
            <span className="text-foreground">Total agora:</span>
            <span className="text-foreground">{totalAfter} leads</span>
          </div>
        </div>



        {/* Botão */}
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center w-full h-10 bg-primary hover:opacity-90 text-primary-foreground rounded-lg transition-colors"
        >
          Entendi
        </button>

    </OverlayModal>
  );
}


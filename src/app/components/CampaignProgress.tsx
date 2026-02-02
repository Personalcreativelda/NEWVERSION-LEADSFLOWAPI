// Componente de Progresso da Campanha em Tempo Real
import { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, Clock, Send, Loader } from 'lucide-react';
import { Button } from './ui/button';
import { useCampaignStatus } from '../hooks/useCampaignStatus';

interface CampaignProgressProps {
  campaignId: string;
  userId: string;
  campaignName: string;
  onClose: () => void;
  onCancel?: () => void;
}

export default function CampaignProgress({
  campaignId,
  userId,
  campaignName,
  onClose,
  onCancel,
}: CampaignProgressProps) {
  const { status, loading, error } = useCampaignStatus(campaignId, userId);
  const [showDetails, setShowDetails] = useState(false);

  // ✅ Fechar automaticamente quando concluído (após 3 segundos)
  useEffect(() => {
    if (status?.status === 'completed' || status?.status === 'failed') {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // 5 segundos

      return () => clearTimeout(timer);
    }
  }, [status?.status, onClose]);

  if (!status && loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-card rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Loader className="w-12 h-12 text-[#10B981] animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-500 dark:text-gray-400">Carregando status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-card rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Erro ao carregar status
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <Button onClick={onClose} variant="outline">
              Fechar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const isSending = status.status === 'sending';
  const isCompleted = status.status === 'completed';
  const isFailed = status.status === 'failed';
  const isCancelled = status.status === 'cancelled';

  const pendingCount = status.totalRecipients - status.sentCount - status.errorCount;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-md max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center space-x-3">
            {isSending && <Loader className="w-6 h-6 text-[#10B981] animate-spin" />}
            {isCompleted && <CheckCircle className="w-6 h-6 text-green-500" />}
            {(isFailed || isCancelled) && <XCircle className="w-6 h-6 text-red-500" />}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {campaignName}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-500 dark:text-gray-400">
                {isSending && 'Enviando mensagens...'}
                {isCompleted && 'Envio concluído!'}
                {isFailed && 'Envio falhou'}
                {isCancelled && 'Envio cancelado'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="mb-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-gray-500 dark:text-gray-400">
                {status.sentCount + status.errorCount} / {status.totalRecipients} processados
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {status.percentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  isCompleted ? 'bg-green-500' :
                  isFailed || isCancelled ? 'bg-red-500' :
                  'bg-[#10B981]'
                }`}
                style={{ width: `${status.percentage}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Enviados
                </span>
              </div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {status.sentCount}
              </p>
            </div>

            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  Aguardando
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {pendingCount}
              </p>
            </div>

            <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                  Erros
                </span>
              </div>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                {status.errorCount}
              </p>
            </div>
          </div>
        </div>

        {/* Recipients List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Destinatários ({status.totalRecipients})
            </h3>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-[#10B981] hover:text-green-600 font-medium"
            >
              {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
            </button>
          </div>

          {showDetails && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {status.recipients.map((recipient, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {recipient.status === 'sent' && (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    )}
                    {recipient.status === 'sending' && (
                      <Loader className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                    )}
                    {recipient.status === 'pending' && (
                      <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                    {recipient.status === 'error' && (
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {recipient.name || recipient.phone}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 dark:text-gray-400">
                        {recipient.phone}
                      </p>
                      {recipient.errorMessage && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {recipient.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {recipient.status === 'sent' && recipient.sentAt && (
                      <span>{new Date(recipient.sentAt).toLocaleTimeString('pt-BR')}</span>
                    )}
                    {recipient.status === 'sending' && <span className="text-blue-600">Enviando...</span>}
                    {recipient.status === 'pending' && <span>Aguardando</span>}
                    {recipient.status === 'error' && <span className="text-red-600">Erro</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex gap-3">
            {isSending && onCancel && (
              <Button
                onClick={onCancel}
                variant="outline"
                className="flex-1 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Cancelar Envio
              </Button>
            )}
            {!isSending && (
              <Button
                onClick={onClose}
                className="flex-1 bg-[#10B981] hover:bg-green-600 text-white"
              >
                {isCompleted ? 'Concluído' : 'Fechar'}
              </Button>
            )}
          </div>
          {isCompleted && (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-3">
              Esta janela fechará automaticamente em alguns segundos
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


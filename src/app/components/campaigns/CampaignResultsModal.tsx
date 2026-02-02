import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { CheckCircle, XCircle, Loader2, MessageSquare } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

interface CampaignResult {
  success: boolean;
  telefone: string;
  nome: string;
  error?: string;
  messageId?: string;
}

interface CampaignResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: CampaignResult[];
  loading: boolean;
}

export default function CampaignResultsModal({
  isOpen,
  onClose,
  results,
  loading,
}: CampaignResultsModalProps) {
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  const totalCount = results.length;

  const successPercentage = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            Resultados da Campanha
          </DialogTitle>
          <DialogDescription>
            Acompanhe o status de envio de cada mensagem
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-green-600 dark:text-green-400 animate-spin mb-4" />
            <p className="text-sm text-gray-600 dark:text-gray-500 dark:text-gray-400">
              Enviando mensagens... Aguarde
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="text-center">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCount}</p>
                </div>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-700">
                <div className="text-center">
                  <p className="text-xs text-green-700 dark:text-green-300 mb-1">Enviados</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{successCount}</p>
                </div>
              </div>
              
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-700">
                <div className="text-center">
                  <p className="text-xs text-red-700 dark:text-red-300 mb-1">Falhados</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{failedCount}</p>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Taxa de Sucesso
                </span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">
                  {successPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${successPercentage}%` }}
                />
              </div>
            </div>

            {/* Results List */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Detalhes dos Envios
              </h4>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {results.map((result, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        result.success
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {result.success ? (
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {result.nome}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-500 dark:text-gray-400">
                          {result.telefone}
                        </p>
                        {result.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {result.error}
                          </p>
                        )}
                      </div>
                      
                      {result.success && (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                          Enviado
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


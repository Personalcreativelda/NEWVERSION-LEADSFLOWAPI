import { useState } from 'react';
import { apiRequest } from '../../utils/api';
import { useConfirm } from '../ui/ConfirmDialog';
import { toast } from "sonner";

/**
 * 🔧 COMPONENTE DE MIGRAÇÃO - Preenche convertedAt para leads já convertidos
 * 
 * USO: Adicione este componente temporariamente no Dashboard e execute uma vez
 */
export function MigrateConvertedDates() {
  const confirm = useConfirm();
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  // Verificar se usuário está autenticado
  const isAuthenticated = !!localStorage.getItem('leadflow_access_token');

  const runMigration = async () => {
    console.log('[Migration] 🔵 runMigration called');
    try {
      console.log('[Migration] 🔵 Mostrando confirmação...');
      const confirmed = await confirm('🔧 Isso vai atualizar todos os leads convertidos para adicionar o campo convertedAt. Continuar?', {
        title: 'Executar migração',
        confirmLabel: 'Continuar',
        variant: 'warning',
      });
      if (!confirmed) {
        console.log('[Migration] ⏭️ Migração cancelada pelo usuário');
        return;
      }

      console.log('[Migration] 🔵 Confirmação aceita, setando estado...');
      setMigrating(true);
      setResult(null);

      console.log('[Migration] 🚀 Iniciando migração...');
      
      // Verificar se existe token de autenticação
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) {
        throw new Error('Você precisa estar logado para executar a migração. Por favor, faça login novamente.');
      }
      
      console.log('[Migration] ✅ Token de autenticação encontrado');
      
      // ✅ Correção: apiRequest(endpoint, method, data)
      const response = await apiRequest('/leads/migrate-converted-dates', 'POST', {});

      console.log('[Migration] ✅ Migração concluída:', response);
      console.log('[Migration] 📊 Estatísticas:');
      console.log('  - Total de leads:', response?.total || 0);
      console.log('  - Atualizados:', response?.updated || 0);
      console.log('  - Ignorados:', response?.skipped || 0);
      console.log('  - Erros:', response?.errors || 0);
      
      setResult(response);
      
      const updated = response?.updated || 0;
      const skipped = response?.skipped || 0;
      const errors = response?.errors || 0;
      
      if (updated > 0) {
        toast.success('✅ Migração concluída!', {
          description: `${updated} leads atualizados, ${skipped} ignorados${errors > 0 ? `, ${errors} erros` : ''}.`
        });
      } else {
        toast.info('ℹ️ Nenhum lead para atualizar', {
          description: 'Todos os leads convertidos já têm convertedAt preenchido.'
        });
      }

      // Recarregar página após 2 segundos APENAS se houve atualizações
      if (updated > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
      
    } catch (error: any) {
      console.error('[Migration] ❌ Erro capturado:', error);
      console.error('[Migration] ❌ Tipo do erro:', typeof error);
      console.error('[Migration] ❌ Stack trace:', error?.stack);
      
      // Extrair mensagem de erro de forma segura
      let errorMessage = 'Erro desconhecido';
      
      try {
        if (error?.message) {
          errorMessage = error.message;
        } else if (error?.error) {
          errorMessage = error.error;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error) {
          errorMessage = String(error);
        }
      } catch (parseError) {
        console.error('[Migration] ❌ Erro ao extrair mensagem:', parseError);
        errorMessage = 'Erro ao processar mensagem de erro';
      }
      
      toast.error('Erro na migração', {
        description: errorMessage
      });
      setResult({ error: errorMessage });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-yellow-100 border-2 border-yellow-500 rounded-lg shadow-lg z-50">
      <div className="mb-2">
        <h3 className="font-bold text-yellow-900">🔧 Migração de Dados</h3>
        <p className="text-sm text-yellow-800">
          Preencher convertedAt para leads convertidos
        </p>
      </div>
      
      <button
        onClick={(e) => {
          console.log('[Migration] 🟢 Botão clicado!');
          e.preventDefault();
          e.stopPropagation();
          console.log('[Migration] 🟢 Chamando runMigration...');
          runMigration().catch(err => {
            console.error('[Migration] ❌ Erro não capturado no onClick:', err);
            toast.error('Erro crítico', {
              description: 'Erro inesperado. Verifique o console.'
            });
          });
        }}
        disabled={migrating}
        className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {migrating ? '⏳ Migrando...' : '▶️ Executar Migração'}
      </button>
      
      {result && (
        <div className="mt-2 p-2 bg-white rounded text-xs">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}


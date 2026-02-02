import { useState, useEffect } from 'react';
import { apiRequest } from '../../utils/api';
import { Card } from '../ui/card';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

/**
 * 🔍 COMPONENTE DE DEBUG - Verifica estado dos leads convertidos
 */
export function DebugLeadsConvertidos() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const checkLeads = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('/leads', 'GET');
      const leads = response.leads || [];

      // Filtrar leads convertidos
      const convertidos = leads.filter((l: any) => 
        (l.status || '').toLowerCase() === 'convertido'
      );

      // Analisar cada lead convertido
      const analysis = convertidos.map((lead: any) => ({
        id: lead.id,
        nome: lead.nome,
        status: lead.status,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        convertedAt: lead.convertedAt,
        hasCreatedAt: !!lead.createdAt,
        hasConvertedAt: !!lead.convertedAt,
        tempoCalculavel: !!(lead.createdAt && lead.convertedAt),
      }));

      setData({
        total: leads.length,
        convertidos: convertidos.length,
        comConvertedAt: analysis.filter(a => a.hasConvertedAt).length,
        semConvertedAt: analysis.filter(a => !a.hasConvertedAt).length,
        calculaveis: analysis.filter(a => a.tempoCalculavel).length,
        details: analysis.slice(0, 10), // Primeiros 10 para análise
      });
    } catch (error: any) {
      console.error('[Debug] Erro:', error);
      setData({ error: error.message || 'Erro desconhecido' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 bg-blue-50 border-2 border-blue-500 max-w-2xl">
      <div className="mb-3">
        <h3 className="font-bold text-blue-900 flex items-center gap-2">
          🔍 Debug - Leads Convertidos
        </h3>
        <p className="text-sm text-blue-800">
          Verificar estado dos leads e campo convertedAt
        </p>
      </div>

      <button
        onClick={checkLeads}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mb-4"
      >
        {loading ? '⏳ Verificando...' : '🔍 Verificar Leads'}
      </button>

      {data && !data.error && (
        <div className="space-y-3">
          {/* Estatísticas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded border border-blue-200">
              <div className="text-xs text-gray-600 dark:text-gray-400">Total de Leads</div>
              <div className="text-2xl font-bold text-gray-800">{data.total}</div>
            </div>
            <div className="bg-white p-3 rounded border border-blue-200">
              <div className="text-xs text-gray-600 dark:text-gray-400">Convertidos</div>
              <div className="text-2xl font-bold text-green-600">{data.convertidos}</div>
            </div>
            <div className="bg-white p-3 rounded border border-blue-200">
              <div className="text-xs text-gray-600 dark:text-gray-400">Com convertedAt</div>
              <div className="text-2xl font-bold text-blue-600">{data.comConvertedAt}</div>
            </div>
            <div className="bg-white p-3 rounded border border-blue-200">
              <div className="text-xs text-gray-600 dark:text-gray-400">Sem convertedAt</div>
              <div className="text-2xl font-bold text-red-600">{data.semConvertedAt}</div>
            </div>
          </div>

          {/* Status */}
          <div className="bg-white p-3 rounded border border-blue-200">
            {data.convertidos === 0 && (
              <div className="flex items-center gap-2 text-yellow-700">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">Nenhum lead com status "convertido" encontrado!</span>
              </div>
            )}
            {data.convertidos > 0 && data.semConvertedAt > 0 && (
              <div className="flex items-center gap-2 text-red-700">
                <XCircle className="w-5 h-5" />
                <span className="font-semibold">
                  {data.semConvertedAt} leads convertidos SEM campo convertedAt!
                </span>
              </div>
            )}
            {data.convertidos > 0 && data.semConvertedAt === 0 && (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">
                  ✅ Todos os leads convertidos têm convertedAt preenchido!
                </span>
              </div>
            )}
          </div>

          {/* Detalhes dos primeiros leads */}
          {data.details && data.details.length > 0 && (
            <div className="bg-white p-3 rounded border border-blue-200">
              <h4 className="font-semibold text-sm mb-2 text-gray-700">
                Amostra (Primeiros 10 Leads Convertidos):
              </h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {data.details.map((lead: any, idx: number) => (
                  <div
                    key={lead.id}
                    className={`p-2 rounded text-xs border ${
                      lead.tempoCalculavel 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="font-semibold">
                      #{idx + 1}: {lead.nome}
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-1 text-gray-700 dark:text-gray-300">
                      <div>Status: {lead.status}</div>
                      <div>ID: {lead.id.substring(0, 8)}...</div>
                      <div className={lead.hasCreatedAt ? 'text-green-600' : 'text-red-600'}>
                        createdAt: {lead.hasCreatedAt ? '✅' : '❌'}
                      </div>
                      <div className={lead.hasConvertedAt ? 'text-green-600' : 'text-red-600'}>
                        convertedAt: {lead.hasConvertedAt ? '✅' : '❌'}
                      </div>
                    </div>
                    {lead.convertedAt && (
                      <div className="text-gray-600 dark:text-gray-400 mt-1">
                        Convertido em: {new Date(lead.convertedAt).toLocaleString('pt-BR')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recomendação */}
          {data.semConvertedAt > 0 && (
            <div className="bg-yellow-50 p-3 rounded border border-yellow-300">
              <div className="font-semibold text-yellow-900 mb-1">💡 Recomendação:</div>
              <p className="text-sm text-yellow-800">
                Execute a migração novamente. Pode haver leads que foram convertidos mas não 
                tinham o campo convertedAt preenchido no momento da primeira migração.
              </p>
            </div>
          )}
        </div>
      )}

      {data?.error && (
        <div className="bg-red-50 p-3 rounded border border-red-300">
          <div className="font-semibold text-red-900">❌ Erro:</div>
          <p className="text-sm text-red-800">{data.error}</p>
        </div>
      )}
    </Card>
  );
}


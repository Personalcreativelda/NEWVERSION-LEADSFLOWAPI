import { useState } from 'react';
import { leadsApi } from '../../utils/api';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Download, X, Star, Zap, Rocket, Info } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportarLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userPlan?: string;
}

export default function ImportarLeadsModal({ isOpen, onClose, onSuccess, userPlan = 'free' }: ImportarLeadsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv')) {
        setError('Por favor, selecione um arquivo CSV ou Excel (.csv, .xls, .xlsx)');
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const downloadTemplate = () => {
    const csvContent = 'data,nome,telefone,interesse,origem,status\n' +
      '2024-01-15,João Silva,258840000001,Produto A,whatsapp,novo\n' +
      '2024-01-15,Maria Santos,258840000002,Serviço B,facebook,qualificado\n' +
      '2024-01-15,Pedro Costa,258840000003,Produto C,instagram,em_negociacao';
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_importacao_leads.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Modelo baixado com sucesso!');
  };

  const handleImport = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo');
      return;
    }

    // Check if user is authenticated
    const token = localStorage.getItem('leadflow_access_token');
    console.log('ImportarLeadsModal - Checking auth token:', {
      hasToken: !!token,
      tokenLength: token?.length || 0,
      allKeys: Object.keys(localStorage)
    });
    
    if (!token) {
      setError('Você precisa estar logado para importar leads. Por favor, faça login novamente.');
      toast.error('Sessão expirada. Faça login novamente.');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let headers: string[] = [];
      let dataRows: any[][] = [];
      
      // Função para normalizar texto (remove acentos, espaços, caracteres especiais)
      const normalizeText = (text: string): string => {
        return String(text || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove acentos
          .replace(/[^a-z0-9]/g, ''); // Remove tudo exceto letras e números
      };
      
      // Detect file type and parse accordingly
      const fileName = file.name.toLowerCase();
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      
      if (isExcel) {
        // Parse Excel file
        console.log('📊 Detectado arquivo Excel, processando...');
        
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          throw new Error('Planilha vazia ou sem dados');
        }
        
        headers = jsonData[0].map(h => normalizeText(h));
        dataRows = jsonData.slice(1);
        
        console.log('✅ Excel parseado:', {
          totalRows: dataRows.length,
          headers: jsonData[0],
          headersNormalized: headers
        });
        
      } else {
        // Parse CSV file
        console.log('📄 Detectado arquivo CSV, processando...');
        
        const text = await file.text();
        
        // Parse CSV properly (handles quotes and commas inside fields)
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"' && inQuotes && nextChar === '"') {
              current += '"';
              i++;
            } else if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          
          result.push(current.trim());
          return result;
        };
        
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        
        if (lines.length < 2) {
          throw new Error('Arquivo CSV vazio ou sem dados');
        }
        
        const headerLine = lines[0];
        const headersOriginal = parseCSVLine(headerLine);
        headers = headersOriginal.map(h => normalizeText(h));
        
        dataRows = lines.slice(1).map(line => parseCSVLine(line));
        
        console.log('✅ CSV parseado:', {
          totalRows: dataRows.length,
          headers: headersOriginal,
          headersNormalized: headers
        });
      }
      
      // Validate headers - be flexible with column names
      const requiredColumns = [
        { 
          name: 'nome', 
          alternatives: [
            'nome', 'name', 'cliente', 'lead', 'contact', 'contato', 
            'nomecompleto', 'fullname', 'nomecompletodocliente', 'nomecliente',
            'nomeclientecompleto', 'nomedocliente', 'nomedo', 'client', 
            'customer', 'pessoa', 'person', 'nomes', 'names'
          ], 
          required: true 
        },
        { 
          name: 'telefone', 
          alternatives: [
            'telefone', 'phone', 'celular', 'whatsapp', 'fone', 'tel', 
            'mobile', 'numero', 'number', 'telefones', 'phones', 
            'zap', 'wpp', 'telefonedowhatsapp', 'numerodowhatsapp',
            'whatsappdocontato', 'telefonedocontato', 'telefoneparacontato'
          ], 
          required: false
        },
        { 
          name: 'email', 
          alternatives: ['email', 'mail', 'correio', 'emaildocontato', 'correioeletronico'], 
          required: false 
        },
        { 
          name: 'interesse', 
          alternatives: [
            'interesse', 'interest', 'produto', 'product', 'servico', 
            'service', 'assunto', 'subject', 'interesseem', 'produtodeinteresse',
            'servicodeinteresse', 'itemdeinteresse', 'item'
          ], 
          required: false
        },
        { 
          name: 'origem', 
          alternatives: [
            'origem', 'source', 'canal', 'channel', 'midia', 'media', 
            'campanha', 'campaign', 'origemdolead', 'fontegeodolead', 'fonte'
          ], 
          required: false
        },
        { 
          name: 'status', 
          alternatives: ['status', 'estado', 'state', 'situacao', 'situation', 'statusdolead'], 
          required: false 
        },
        { 
          name: 'data', 
          alternatives: [
            'data', 'date', 'datacadastro', 'createdat', 'criacao', 
            'datadecriacao', 'datadocadastro', 'dataregistro', 'datacriacao'
          ], 
          required: false 
        },
        { 
          name: 'agente_atual', 
          alternatives: [
            'agenteaatual', 'agenteaatual', 'agente', 'agent', 'responsavel', 'responsible', 
            'atendente', 'vendedor', 'seller', 'agentedevendas'
          ], 
          required: false 
        },
        { 
          name: 'observacoes', 
          alternatives: [
            'observacoes', 'observacao', 'obs', 'notes', 'notas', 
            'comentarios', 'comments', 'anotacoes', 'detalhes', 'details'
          ], 
          required: false 
        },
        { 
          name: 'leads_fec', 
          alternatives: [
            'leadsfec', 'leads_fec', 'leadfec', 'leadsfechados', 
            'leadfechado', 'fechado', 'closed', 'fechamento'
          ], 
          required: false 
        }
      ];
      
      // Map headers to required columns
      const headerMap: Record<string, number> = {};
      
      requiredColumns.forEach(col => {
        const foundIndex = headers.findIndex(h => 
          col.alternatives.some(alt => normalizeText(alt) === h)
        );
        
        if (foundIndex !== -1) {
          headerMap[col.name] = foundIndex;
          console.log(`✅ Coluna "${col.name}" mapeada para índice ${foundIndex}`);
        }
      });
      
      // Verificar se tem pelo menos NOME
      if (headerMap['nome'] === undefined) {
        throw new Error(
          `❌ Coluna NOME não encontrada!\n\n` +
          `📋 Colunas encontradas no seu arquivo:\n${headers.join(', ')}\n\n` +
          `✅ Aceito qualquer uma destas:\n` +
          `nome, name, cliente, lead, contact, contato, nomecompleto, fullname, client, customer, pessoa\n\n` +
          `💡 Renomeie uma coluna para "nome" ou "name" e tente novamente.`
        );
      }

      // Parse leads
      const leads = [];
      let skippedRows = 0;
      
      for (let i = 0; i < dataRows.length; i++) {
        try {
          const values = dataRows[i];
          
          if (!values || values.length === 0 || values.every(v => !v)) {
            skippedRows++;
            continue;
          }

          const lead: any = {
            data: values[headerMap['data']] || new Date().toISOString().split('T')[0],
            nome: values[headerMap['nome']],
            telefone: values[headerMap['telefone']] || '',
            email: values[headerMap['email']] || '',
            interesse: values[headerMap['interesse']] || 'Não especificado',
            origem: values[headerMap['origem']] || 'Importação',
            status: values[headerMap['status']] || 'novo'
          };

          // Add optional fields if they exist
          if (headerMap['agente_atual'] !== undefined && values[headerMap['agente_atual']]) {
            lead.agente_atual = values[headerMap['agente_atual']];
          }
          if (headerMap['observacoes'] !== undefined && values[headerMap['observacoes']]) {
            lead.observacoes = values[headerMap['observacoes']];
          }
          if (headerMap['leads_fec'] !== undefined && values[headerMap['leads_fec']]) {
            lead.leads_fec = values[headerMap['leads_fec']];
          }

          // Validate ONLY required field: nome
          if (!lead.nome || String(lead.nome).trim() === '') {
            skippedRows++;
            continue;
          }
          
          // Validate that at least one contact method exists (telefone OR email)
          if (!lead.telefone && !lead.email) {
            console.warn(`Lead "${lead.nome}" ignorado: sem telefone ou email`);
            skippedRows++;
            continue;
          }

          leads.push(lead);
        } catch (err) {
          console.error('Erro ao processar linha', i, err);
          skippedRows++;
        }
      }

      if (leads.length === 0) {
        throw new Error('Nenhum lead válido encontrado no arquivo');
      }

      console.log(`✅ Processados ${leads.length} leads válidos, ${skippedRows} linhas ignoradas`);

      // Log dos primeiros 3 leads para debug
      console.log('📊 Exemplo de leads processados:', {
        total: leads.length,
        primeiros3: leads.slice(0, 3),
        campos: Object.keys(leads[0] || {})
      });

      // Send to backend using leadsApi
      console.log('[ImportarLeadsModal] Sending leads to backend...');
      const response = await leadsApi.importBulk(leads);

      console.log('📡 Resposta da API:', response);

      // Validar estrutura da resposta
      const imported = response.imported || leads.length;
      const skipped = response.skipped || 0;
      const duplicatesSkipped = response.duplicatesSkipped || 0;

      const importResult = {
        imported,
        skipped,
        duplicatesSkipped
      };

      setResult(importResult);

      if (duplicatesSkipped > 0) {
        toast.success(`${imported} leads importados! (${duplicatesSkipped} duplicados ignorados)`);
      } else {
        toast.success(`${imported} leads importados com sucesso!`);
      }

      // Close modal after 2 seconds
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 2000);
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Erro ao importar arquivo');
      toast.error(err.message || 'Erro ao importar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setError(null);
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-lg animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <DialogTitle className="text-lg text-gray-900">Importar Leads</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Importe seus leads através de um arquivo CSV ou planilha
          </DialogDescription>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
            disabled={loading}
          >
            <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </DialogHeader>

        {/* Body - Scrollable */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">

          <Alert className="border border-[hsl(var(--primary))/0.25] bg-[hsl(var(--primary))/0.08]">
            <Info className="h-4 w-4 text-[hsl(var(--primary))]" />
            <AlertTitle className="text-sm font-semibold text-foreground">
              Antes de importar
            </AlertTitle>
            <AlertDescription className="space-y-1 text-xs text-muted-foreground">
              <p>• Use o modelo para garantir cabeçalhos corretos (nome, telefone, interesse, origem).</p>
              <p>• Corrigimos automaticamente registros sem contato e ignoramos duplicados.</p>
              <p>• Os limites de importação são aplicados automaticamente de acordo com seu plano.</p>
            </AlertDescription>
          </Alert>
          
          {/* Planos Cards - Responsivo e Bonito */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Card Free */}
            <div className={`relative p-4 rounded-xl border-2 transition-all ${
              userPlan === 'free' 
                ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-500 shadow-lg' 
                : 'bg-gray-50 border-gray-200 opacity-60'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Star className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">Free</h4>
                  {userPlan === 'free' && (
                    <span className="text-xs text-blue-600">Seu plano atual</span>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-gray-900">50</p>
                <p className="text-xs text-gray-700 dark:text-gray-300">leads por importação</p>
              </div>
            </div>

            {/* Card Business */}
            <div className={`relative p-4 rounded-xl border-2 transition-all ${
              userPlan === 'business' 
                ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-500 shadow-lg' 
                : 'bg-gray-50 border-gray-200 opacity-60'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">Business</h4>
                  {userPlan === 'business' && (
                    <span className="text-xs text-purple-600">Seu plano atual</span>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-gray-900">250</p>
                <p className="text-xs text-gray-700 dark:text-gray-300">leads por importação</p>
              </div>
              {userPlan === 'free' && (
                <div className="mt-2">
                  <span className="text-xs text-purple-600 font-medium">↑ Upgrade</span>
                </div>
              )}
            </div>

            {/* Card Enterprise */}
            <div className={`relative p-4 rounded-xl border-2 transition-all ${
              userPlan === 'enterprise' 
                ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-500 shadow-lg' 
                : 'bg-gray-50 border-gray-200 opacity-60'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <Rocket className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">Enterprise</h4>
                  {userPlan === 'enterprise' && (
                    <span className="text-xs text-amber-600">Seu plano atual</span>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-gray-900">∞</p>
                <p className="text-xs text-gray-700 dark:text-gray-300">Ilimitado</p>
              </div>
              {userPlan !== 'enterprise' && (
                <div className="mt-2">
                  <span className="text-xs text-amber-600 font-medium">↑ Upgrade</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Instructions Card */}
          <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 border border-blue-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-500 rounded-lg shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  📋 Formato da Planilha
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                  <div>
                    <p className="font-medium text-blue-900 mb-1">✅ Obrigatórias:</p>
                    <ul className="space-y-0.5 ml-2">
                      <li>• nome</li>
                      <li>• telefone</li>
                      <li>• interesse</li>
                      <li>• origem</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-purple-900 mb-1">⚙️ Opcionais:</p>
                    <ul className="space-y-0.5 ml-2">
                      <li>• data</li>
                      <li>• status</li>
                      <li>• observacoes</li>
                      <li>• agente_atual</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-white/60 rounded-lg border border-blue-200">
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    <strong>💡 Dica:</strong> Baixe o modelo e veja exemplos de como preencher!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Download Template */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="gap-2 h-9 text-sm"
              disabled={loading}
            >
              <Download className="w-4 h-4" />
              Baixar Modelo de Planilha
            </Button>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
            <input
              type="file"
              id="file-upload"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileChange}
              className="hidden"
              disabled={loading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="w-10 h-10 text-gray-700 dark:text-gray-300" />
              <div>
                <p className="text-sm text-gray-700 mb-1">
                  {file ? file.name : 'Clique para selecionar ou arraste o arquivo aqui'}
                </p>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  CSV, XLS ou XLSX (max 5MB)
                </p>
              </div>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold">Importação não concluída</AlertTitle>
              <AlertDescription className="space-y-1">
                <p className="text-sm text-destructive/90">{error}</p>
                <p className="text-xs text-muted-foreground">
                  Verifique o cabeçalho do arquivo, confirme que cada linha possui telefone ou email e que o limite do plano não foi excedido.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {result && (
            <Alert className="border border-emerald-200/60 bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-sm font-semibold text-emerald-800">
                Importação concluída
              </AlertTitle>
              <AlertDescription className="space-y-1 text-sm text-emerald-900">
                <p>✓ {result.imported} leads importados com sucesso.</p>
                {result.skipped > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ⚠ {result.skipped} registros foram ignorados por estarem duplicados ou incompletos.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

        </div>

        {/* Footer - Fixed */}
        <div className="px-5 py-3 border-t border-gray-200 flex gap-3 justify-end shrink-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="h-9"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || loading || !!result}
            className="bg-blue-600 hover:bg-blue-700 text-white h-9"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : result ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Importado!
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar Leads
              </>
            )}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}




import { useState } from 'react';
import { leadsApi } from '../../utils/api';
import { toast } from 'sonner';
import { AppModal } from '../base/AppModal';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Download, Zap, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { NUMBER_OPTS, getLocale } from '../../utils/format';
import { saveFile } from '../../lib/saveFile';

interface ImportarLeadsModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
 planName?: string;
 /** Máximo de leads por importação (plan_limits.leads); -1 = ilimitado */
 importLimit?: number;
}

export default function ImportarLeadsModal({ 
 isOpen, 
 onClose, 
 onSuccess, 
 planName = 'free',
 importLimit = -1
}: ImportarLeadsModalProps) {
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
 setError('Por favor, selecione um ficheiro CSV ou Excel (.csv, .xls, .xlsx)');
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
 
 // BOM: o Excel abre os acentos corretamente
 void saveFile('modelo_importacao_leads.csv', new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], { type: 'text/csv' }), 'text/csv');
 };

 const handleImport = async () => {
 if (!file) {
 setError('Por favor, selecione um ficheiro');
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
 console.log(`✅ Coluna"${col.name}" mapeada para índice ${foundIndex}`);
 }
 });
 
 // Verificar se tem pelo menos NOME
 if (headerMap['nome'] === undefined) {
 throw new Error(
 `Coluna NOME não encontrada!\n\n` +
 `Colunas encontradas no seu arquivo:\n${headers.join(', ')}\n\n` +
 `Aceito qualquer uma destas:\n` +
 `nome, name, cliente, lead, contact, contato, nomecompleto, fullname, client, customer, pessoa\n\n` +
 `Renomeie uma coluna para"nome" ou"name" e tente novamente.`
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
 console.warn(`Lead"${lead.nome}" ignorado: sem telefone ou email`);
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
 setError(err.message || 'Erro ao importar ficheiro');
 toast.error(err.message || 'Erro ao importar ficheiro');
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

 const planLabel = planName.charAt(0).toUpperCase() + planName.slice(1);
 const limitText = importLimit === -1
 ? `O plano ${planLabel} não tem limite de leads por importação.`
 : `O plano ${planLabel} importa até ${importLimit.toLocaleString(getLocale(), NUMBER_OPTS)} leads por ficheiro; o resto da planilha é ignorado.`;

 return (
 <AppModal
 open={isOpen}
 onOpenChange={(open) => { if (!open && !loading) handleClose(); }}
 size="lg"
 title={
 <span className="flex items-center gap-2">
 <FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
 Importar leads
 </span>
 }
 description="Envie um ficheiro CSV ou Excel com os seus contactos."
 bodyClassName="space-y-4"
 footer={
 <>
 <Button variant="outline" onClick={handleClose} disabled={loading}>
 Cancelar
 </Button>
 <Button onClick={handleImport} disabled={!file || loading || !!result}>
 {loading ? (
 <>
 <Loader2 className="w-4 h-4 mr-2 animate-spin" />
 A importar...
 </>
 ) : result ? (
 <>
 <CheckCircle2 className="w-4 h-4 mr-2" />
 Importado
 </>
 ) : (
 <>
 <Upload className="w-4 h-4 mr-2" />
 Importar leads
 </>
 )}
 </Button>
 </>
 }
 >
 {/* Ficheiro */}
 <div className="border-2 border-dashed border-border rounded-xl p-5 text-center hover:border-primary transition-colors">
 <input
 type="file"
 id="file-upload"
 accept=".csv,.xls,.xlsx"
 onChange={handleFileChange}
 className="hidden"
 disabled={loading}
 />
 <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2 min-w-0">
 <Upload className="w-8 h-8 text-muted-foreground" />
 <p className="text-sm font-medium text-foreground break-all">
 {file ? file.name : 'Toque para escolher o ficheiro'}
 </p>
 <p className="text-xs text-muted-foreground">CSV, XLS ou XLSX (máx. 5 MB)</p>
 </label>
 </div>

 {error && (
 <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
 <AlertCircle className="h-4 w-4" />
 <AlertTitle className="text-sm font-semibold">Importação não concluída</AlertTitle>
 <AlertDescription className="space-y-1">
 <p className="text-sm text-destructive/90">{error}</p>
 <p className="text-xs text-muted-foreground">
 Verifique o cabeçalho do ficheiro, confirme que cada linha tem telefone ou email e que o limite do plano não foi excedido.
 </p>
 </AlertDescription>
 </Alert>
 )}

 {result && (
 <Alert className="border-emerald-500/30 bg-emerald-500/10">
 <CheckCircle2 className="h-4 w-4 text-emerald-500" />
 <AlertTitle className="text-sm font-semibold text-foreground">Importação concluída</AlertTitle>
 <AlertDescription className="space-y-1 text-sm text-foreground/80">
 <p>{result.imported} leads importados.</p>
 {result.skipped > 0 && (
 <p className="text-xs text-muted-foreground">
 {result.skipped} registos ignorados por estarem duplicados ou incompletos.
 </p>
 )}
 </AlertDescription>
 </Alert>
 )}

 {/* Formato */}
 <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
 <div className="flex items-start gap-2">
 <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
 <p className="text-xs text-muted-foreground min-w-0">
 Use o modelo para ter os cabeçalhos certos. Linhas sem contacto e duplicados são ignorados.
 </p>
 </div>
 <div className="flex items-start gap-2">
 <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
 <p className="text-xs text-muted-foreground min-w-0">{limitText}</p>
 </div>
 <div className="grid grid-cols-2 gap-3 text-xs">
 <div className="min-w-0">
 <p className="font-medium text-foreground mb-1">Obrigatórias</p>
 <p className="text-muted-foreground">nome, telefone, interesse, origem</p>
 </div>
 <div className="min-w-0">
 <p className="font-medium text-foreground mb-1">Opcionais</p>
 <p className="text-muted-foreground break-words">data, status, observacoes, agente_atual</p>
 </div>
 </div>
 <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2" disabled={loading}>
 <Download className="w-4 h-4" />
 Transferir modelo
 </Button>
 </div>

 </AppModal>
 );
}

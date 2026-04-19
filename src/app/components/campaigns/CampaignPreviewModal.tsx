import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Upload, X, FileText, Image as ImageIcon, Film, FileType } from 'lucide-react';
import { toast } from "sonner";

interface CampaignPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'whatsapp' | 'email';
  campaignName: string;
  message?: string;
  subject?: string;
  body?: string;
  recipientsCount: number;
  attachments: File[];
  onAttachmentsChange: (files: File[]) => void;
  firstLead?: any; // Primeiro lead selecionado para preview personalizado
}

export default function CampaignPreviewModal({
  isOpen,
  onClose,
  type,
  campaignName,
  message,
  subject,
  body,
  recipientsCount,
  attachments,
  onAttachmentsChange,
  firstLead
}: CampaignPreviewModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  const handleFiles = (files: File[]) => {
    // Validate file size (16MB max)
    const maxSize = 16 * 1024 * 1024; // 16MB
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast.error(`${file.name} excede o tamanho máximo de 16MB`);
        return false;
      }
      return true;
    });

    // Validate file types
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const filteredFiles = validFiles.filter(file => {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name} não é um tipo de arquivo permitido`);
        return false;
      }
      return true;
    });

    if (filteredFiles.length > 0) {
      onAttachmentsChange([...attachments, ...filteredFiles]);
      toast.success(`${filteredFiles.length} arquivo(s) adicionado(s)`);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const removeAttachment = (index: number) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(newAttachments);
    toast.success('Arquivo removido');
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-blue-500" />;
    } else if (file.type.startsWith('video/')) {
      return <Film className="w-5 h-5 text-primary" />;
    } else {
      return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderPreview = () => {
    const previewMessage = message || body || '';
    // Usar dados do primeiro lead selecionado, ou dados de exemplo
    const sampleName = firstLead?.nome || 'João Silva';
    const samplePhone = firstLead?.telefone || '+55 11 98765-4321';
    const sampleEmail = firstLead?.email || 'joao@exemplo.com';

    let personalizedMessage = previewMessage
      .replace(/{nome}/g, sampleName)
      .replace(/{telefone}/g, samplePhone)
      .replace(/{email}/g, sampleEmail);

    if (type === 'whatsapp') {
      return (
        <div className="bg-gradient-to-b from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-950/20 rounded-xl p-6">
          <div className="max-w-md mx-auto">
            {/* WhatsApp Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-400 rounded-full flex items-center justify-center text-white font-semibold">
                {sampleName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-foreground">{sampleName}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>

            {/* Message Bubble */}
            <div className="bg-card rounded-lg rounded-tl-none p-4 shadow-md">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {personalizedMessage}
              </p>
              
              {/* Attachments Preview */}
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      {file.type.startsWith('image/') ? (
                        <img 
                          src={URL.createObjectURL(file)} 
                          alt={file.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                          {getFileIcon(file)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground text-right mt-2">
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Email Preview
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Email Header */}
        <div className="border-b border-border p-4 bg-muted/50">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-semibold text-foreground">{subject || 'Sem assunto'}</p>
              <p className="text-sm text-muted-foreground mt-1">
                De: Sua Empresa &lt;contato@empresa.com&gt;
              </p>
              <p className="text-sm text-muted-foreground">
                Para: {sampleName} &lt;{sampleEmail}&gt;
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Email Body */}
        <div className="p-6">
          <div className="prose dark:prose-invert max-w-none">
            <p className="text-foreground whitespace-pre-wrap">
              {personalizedMessage}
            </p>
          </div>

          {/* Email Attachments */}
          {attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm font-medium text-foreground/80 mb-3">
                Anexos ({attachments.length})
              </p>
              <div className="grid grid-cols-2 gap-3">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                    {file.type.startsWith('image/') ? (
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt={file.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                        {getFileIcon(file)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Prévia da Campanha: {campaignName || 'Sem título'}
          </DialogTitle>
          <DialogDescription>
            Revise a mensagem e adicione arquivos antes de enviar para {recipientsCount} destinatário(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Campaign Preview */}
          <div>
            <h4 className="text-sm font-medium text-foreground/80 mb-3">
              Prévia da Mensagem
            </h4>
            {renderPreview()}
          </div>

          {/* File Upload Section */}
          <div>
            <h4 className="text-sm font-medium text-foreground/80 mb-3">
              Anexos da Campanha
            </h4>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-border hover:border-green-400 dark:hover:border-green-500'
              }`}
            >
              <Upload className={`w-12 h-12 mx-auto mb-3 ${
                dragActive ? 'text-green-500' : 'text-muted-foreground/70'
              }`} />
              <p className="text-sm font-medium text-foreground mb-1">
                Clique ou arraste arquivos para adicionar
              </p>
              <p className="text-xs text-muted-foreground">
                Imagens, vídeos, PDFs e documentos até 16MB
              </p>
            </div>

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-foreground/80">
                  Arquivos Anexados ({attachments.length})
                </p>
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border"
                  >
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-14 h-14 object-cover rounded"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-muted rounded flex items-center justify-center">
                        {getFileIcon(file)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachment(index);
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              toast.success('Prévia confirmada! Pronta para enviar.');
              onClose();
            }}
            className="bg-green-600 text-white hover:bg-green-700 transition-all duration-150"
          >
            Confirmar e Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


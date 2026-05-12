import React from 'react';
import {
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  File,
  Video,
  Music,
  Image as ImageIcon,
} from 'lucide-react';
import type { AttachmentItem } from '../../types/attachment';
import { UploadProgressIndicator } from './UploadProgressIndicator';

interface AttachmentPreviewCardProps {
  attachment: AttachmentItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABEL: Record<string, string> = {
  image: 'IMAGEM',
  video: 'VÍDEO',
  audio: 'ÁUDIO',
  document: 'DOCUMENTO',
};

const TYPE_COLOR: Record<string, string> = {
  image: 'bg-blue-500/10 text-blue-500',
  video: 'bg-purple-500/10 text-purple-500',
  audio: 'bg-green-500/10 text-green-500',
  document: 'bg-orange-500/10 text-orange-500',
};

function FileIcon({ type }: { type: string }) {
  const cls = 'text-muted-foreground';
  switch (type) {
    case 'image': return <ImageIcon size={28} className={cls} />;
    case 'video': return <Video size={28} className={cls} />;
    case 'audio': return <Music size={28} className={cls} />;
    default: return <File size={28} className={cls} />;
  }
}

export function AttachmentPreviewCard({
  attachment,
  onRemove,
  onRetry,
}: AttachmentPreviewCardProps) {
  const { id, name, size, fileType, previewUrl, uploadProgress, status, error } = attachment;

  const isLoading = status === 'uploading' || status === 'pending';
  const isFailed = status === 'failed';
  const isUploaded = status === 'uploaded';

  return (
    <div className="relative flex-shrink-0 w-[152px] rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* ── Thumbnail / icon area ── */}
      <div className="relative w-full h-[112px] bg-muted flex items-center justify-center overflow-hidden">
        {previewUrl && fileType === 'image' ? (
          <img src={previewUrl} alt={name} className="w-full h-full object-cover" />
        ) : previewUrl && fileType === 'video' ? (
          <video src={previewUrl} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <FileIcon type={fileType} />
        )}

        {/* Loading overlay with circular progress */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <UploadProgressIndicator progress={uploadProgress} size={48} strokeWidth={3.5} />
          </div>
        )}

        {/* Uploaded badge */}
        {isUploaded && (
          <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
            <CheckCircle2 size={13} className="text-white" />
          </div>
        )}

        {/* Failed overlay */}
        {isFailed && (
          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2 px-2">
            <AlertCircle size={22} className="text-red-400" />
            <button
              type="button"
              onClick={() => onRetry(id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              <RefreshCw size={10} />
              Tentar novamente
            </button>
          </div>
        )}

        {/* Remove / cancel button */}
        <button
          type="button"
          onClick={() => onRemove(id)}
          className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 hover:bg-black/85 text-white rounded-full flex items-center justify-center transition-colors z-10"
          title={isLoading ? 'Cancelar upload' : 'Remover'}
          aria-label={isLoading ? 'Cancelar upload' : 'Remover anexo'}
        >
          <X size={11} />
        </button>
      </div>

      {/* ── File info ── */}
      <div className="px-2.5 py-2 space-y-1">
        <p className="text-[11px] font-medium text-foreground truncate leading-tight" title={name}>
          {name}
        </p>

        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] text-muted-foreground">{formatSize(size)}</span>
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight ${
              TYPE_COLOR[fileType] ?? 'bg-muted text-muted-foreground'
            }`}
          >
            {TYPE_LABEL[fileType] ?? fileType.toUpperCase()}
          </span>
        </div>

        {/* Error message */}
        {isFailed && error && (
          <p className="text-[9px] text-red-500 truncate leading-tight" title={error}>
            {error}
          </p>
        )}

        {/* Thin progress bar at the bottom */}
        {isLoading && (
          <div className="h-[3px] rounded-full bg-muted-foreground/20 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

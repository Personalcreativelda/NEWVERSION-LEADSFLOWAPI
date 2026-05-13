import type { AttachmentFileType } from '../types/attachment';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

export const MAX_UPLOAD_SIZE_MB = 16;
/** 16 MB max per file — matches the backend inbox upload limit */
export const MAX_FILE_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export interface UploadOptions {
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
  /** Override the upload endpoint path. Defaults to '/inbox/upload'. */
  endpoint?: string;
}

export interface UploadResult {
  url: string;
  media_type: 'image' | 'video' | 'audio' | 'document';
}

/** Returns a validation error message, or null if the file is valid. */
export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `O ficheiro excede o limite máximo de ${MAX_UPLOAD_SIZE_MB}MB.`;
  }
  return null;
}

/** Derive a simple file category from the MIME type. */
export function getFileType(file: File): AttachmentFileType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Upload a single file to the backend with real progress reporting.
 * Uses XMLHttpRequest so the browser sends actual upload-progress events.
 */
export function uploadAttachment(
  file: File,
  options: UploadOptions,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);

    // --- progress ---
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    // --- done ---
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as UploadResult & { success?: boolean };
          resolve({ url: data.url, media_type: data.media_type });
        } catch {
          reject(new Error('Resposta inválida do servidor'));
        }
      } else {
        let msg = `Falha no upload (HTTP ${xhr.status})`;
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string };
          if (err.error) msg = err.error;
        } catch { /* ignore */ }
        reject(new Error(msg));
      }
    });

    // --- errors ---
    xhr.addEventListener('error', () => reject(new Error('Erro de rede durante o upload')));
    xhr.addEventListener('abort', () =>
      reject(new DOMException('Upload cancelado', 'AbortError')),
    );

    // --- abort signal ---
    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    // --- send ---
    const token = localStorage.getItem('leadflow_access_token');
    const endpointPath = options.endpoint ?? '/inbox/upload';
    xhr.open('POST', `${BASE_URL}${endpointPath}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(form);
  });
}

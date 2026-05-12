import { useState, useCallback, useRef, useEffect } from 'react';
import type { AttachmentItem } from '../types/attachment';
import { uploadAttachment, validateFile, getFileType } from '../services/uploadService';

function generateId(): string {
  return `${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

/** Fingerprint to prevent duplicate files in the queue */
function fileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export interface UseUploadQueueReturn {
  attachments: AttachmentItem[];
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  retryUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  clearAttachments: () => void;
  /** True when all attachments are either uploaded or canceled (and there is at least one) */
  allUploadsCompleted: boolean;
  /** True while any file is pending or uploading */
  isUploading: boolean;
}

export function useUploadQueue(): UseUploadQueueReturn {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  /** AbortControllers keyed by attachment id */
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  /** Object URLs keyed by attachment id — used for cleanup */
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  /** Fingerprints of files already in the queue */
  const keysRef = useRef<Set<string>>(new Set());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllersRef.current.forEach((ctrl) => ctrl.abort());
      controllersRef.current.clear();
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  const startUpload = useCallback((id: string, file: File) => {
    const controller = new AbortController();
    controllersRef.current.set(id, controller);

    // Mark as uploading
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'uploading', uploadProgress: 0 } : a)),
    );

    uploadAttachment(file, {
      signal: controller.signal,
      onProgress: (percent) => {
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploadProgress: percent } : a)),
        );
      },
    })
      .then((result) => {
        controllersRef.current.delete(id);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: 'uploaded',
                  uploadProgress: 100,
                  uploadedUrl: result.url,
                  uploadedMediaType: result.media_type,
                  error: undefined,
                }
              : a,
          ),
        );
      })
      .catch((err: Error) => {
        controllersRef.current.delete(id);
        if (err.name === 'AbortError') {
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: 'canceled' } : a)),
          );
        } else {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, status: 'failed', error: err.message } : a,
            ),
          );
        }
      });
  }, []);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newAttachments: AttachmentItem[] = [];

      for (const file of Array.from(files)) {
        const key = fileKey(file);
        if (keysRef.current.has(key)) continue; // skip duplicate

        const validationError = validateFile(file);
        const id = generateId();
        const fileType = getFileType(file);
        const previewUrl =
          fileType === 'image' || fileType === 'video'
            ? URL.createObjectURL(file)
            : undefined;

        if (previewUrl) previewUrlsRef.current.set(id, previewUrl);
        keysRef.current.add(key);

        newAttachments.push({
          id,
          file,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          fileType,
          previewUrl,
          uploadProgress: 0,
          status: validationError ? 'failed' : 'pending',
          error: validationError ?? undefined,
        });
      }

      if (newAttachments.length === 0) return;

      setAttachments((prev) => [...prev, ...newAttachments]);

      // Kick off uploads on next tick so state has settled
      for (const att of newAttachments) {
        if (att.status === 'pending') {
          setTimeout(() => startUpload(att.id, att.file), 0);
        }
      }
    },
    [startUpload],
  );

  const removeAttachment = useCallback((id: string) => {
    // Cancel in-flight upload
    const ctrl = controllersRef.current.get(id);
    if (ctrl) {
      ctrl.abort();
      controllersRef.current.delete(id);
    }

    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att) {
        keysRef.current.delete(fileKey(att.file));
        const pUrl = previewUrlsRef.current.get(id);
        if (pUrl) {
          URL.revokeObjectURL(pUrl);
          previewUrlsRef.current.delete(id);
        }
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const retryUpload = useCallback(
    (id: string) => {
      setAttachments((prev) => {
        const att = prev.find((a) => a.id === id);
        if (!att) return prev;
        // Schedule upload after state update
        setTimeout(() => startUpload(id, att.file), 0);
        return prev.map((a) =>
          a.id === id
            ? { ...a, status: 'pending', uploadProgress: 0, error: undefined }
            : a,
        );
      });
    },
    [startUpload],
  );

  const cancelUpload = useCallback((id: string) => {
    const ctrl = controllersRef.current.get(id);
    if (ctrl) {
      ctrl.abort();
      controllersRef.current.delete(id);
    }
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'canceled' } : a)),
    );
  }, []);

  const clearAttachments = useCallback(() => {
    controllersRef.current.forEach((ctrl) => ctrl.abort());
    controllersRef.current.clear();
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
    keysRef.current.clear();
    setAttachments([]);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const allUploadsCompleted =
    attachments.length === 0 ||
    attachments.every((a) => a.status === 'uploaded' || a.status === 'canceled');

  const isUploading = attachments.some(
    (a) => a.status === 'uploading' || a.status === 'pending',
  );

  return {
    attachments,
    addFiles,
    removeAttachment,
    retryUpload,
    cancelUpload,
    clearAttachments,
    allUploadsCompleted,
    isUploading,
  };
}

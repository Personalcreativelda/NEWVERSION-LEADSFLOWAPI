/**
 * UploadQueueContext
 *
 * Global upload queue keyed by conversationId.
 * Uploads started in one conversation continue in the background even when the
 * user navigates to another conversation — uploads never cancel on unmount.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { AttachmentItem } from '../types/attachment';
import {
  uploadAttachment,
  validateFile,
  getFileType,
} from '../services/uploadService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConvQueue {
  attachments: AttachmentItem[];
  allUploadsCompleted: boolean;
  isUploading: boolean;
}

interface UploadQueueContextValue {
  /** Get the queue state for a specific conversation. */
  getQueue: (conversationId: string) => ConvQueue;
  addFiles: (conversationId: string, files: FileList | File[]) => void;
  removeAttachment: (conversationId: string, id: string) => void;
  retryUpload: (conversationId: string, id: string) => void;
  cancelUpload: (conversationId: string, id: string) => void;
  clearAttachments: (conversationId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function fileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function deriveFlags(attachments: AttachmentItem[]): Pick<ConvQueue, 'allUploadsCompleted' | 'isUploading'> {
  return {
    allUploadsCompleted:
      attachments.length === 0 ||
      attachments.every(
        (a) => a.status === 'uploaded' || a.status === 'canceled' || a.status === 'failed',
      ),
    isUploading: attachments.some(
      (a) => a.status === 'uploading' || a.status === 'pending',
    ),
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  /**
   * Master state: a map from conversationId → AttachmentItem[].
   * We keep it as a plain object so React can detect changes on re-render.
   */
  const [queues, setQueues] = useState<Record<string, AttachmentItem[]>>({});

  /** AbortControllers: `${conversationId}:${attachmentId}` → AbortController */
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  /** Object URLs: `${conversationId}:${attachmentId}` → objectUrl */
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  /** Duplicate-guard: `${conversationId}` → Set<fileKey> */
  const keysRef = useRef<Map<string, Set<string>>>(new Map());

  // Cleanup all on unmount (provider never unmounts in normal usage)
  useEffect(() => {
    return () => {
      controllersRef.current.forEach((ctrl) => ctrl.abort());
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  const ctrlKey = (convId: string, attId: string) => `${convId}:${attId}`;

  const startUpload = useCallback((conversationId: string, id: string, file: File) => {
    const controller = new AbortController();
    controllersRef.current.set(ctrlKey(conversationId, id), controller);

    // Mark as uploading
    setQueues((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] ?? []).map((a) =>
        a.id === id ? { ...a, status: 'uploading', uploadProgress: 0 } : a,
      ),
    }));

    uploadAttachment(file, {
      signal: controller.signal,
      onProgress: (percent) => {
        setQueues((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((a) =>
            a.id === id ? { ...a, uploadProgress: percent } : a,
          ),
        }));
      },
    })
      .then((result) => {
        controllersRef.current.delete(ctrlKey(conversationId, id));
        setQueues((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((a) =>
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
        }));
      })
      .catch((err: Error) => {
        controllersRef.current.delete(ctrlKey(conversationId, id));
        if (err.name === 'AbortError') {
          setQueues((prev) => ({
            ...prev,
            [conversationId]: (prev[conversationId] ?? []).map((a) =>
              a.id === id ? { ...a, status: 'canceled' } : a,
            ),
          }));
        } else {
          setQueues((prev) => ({
            ...prev,
            [conversationId]: (prev[conversationId] ?? []).map((a) =>
              a.id === id ? { ...a, status: 'failed', error: err.message } : a,
            ),
          }));
        }
      });
  }, []);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const addFiles = useCallback(
    (conversationId: string, files: FileList | File[]) => {
      if (!keysRef.current.has(conversationId)) {
        keysRef.current.set(conversationId, new Set());
      }
      const convKeys = keysRef.current.get(conversationId)!;
      const newAttachments: AttachmentItem[] = [];

      for (const file of Array.from(files)) {
        const key = fileKey(file);
        if (convKeys.has(key)) continue;

        const validationError = validateFile(file);
        const id = generateId();
        const fileType = getFileType(file);
        const previewUrl =
          fileType === 'image' || fileType === 'video'
            ? URL.createObjectURL(file)
            : undefined;

        if (previewUrl) previewUrlsRef.current.set(ctrlKey(conversationId, id), previewUrl);
        convKeys.add(key);

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

      setQueues((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] ?? []), ...newAttachments],
      }));

      for (const att of newAttachments) {
        if (att.status === 'pending') {
          setTimeout(() => startUpload(conversationId, att.id, att.file), 0);
        }
      }
    },
    [startUpload],
  );

  const removeAttachment = useCallback((conversationId: string, id: string) => {
    const ck = ctrlKey(conversationId, id);
    const ctrl = controllersRef.current.get(ck);
    if (ctrl) {
      ctrl.abort();
      controllersRef.current.delete(ck);
    }
    const previewUrl = previewUrlsRef.current.get(ck);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(ck);
    }

    setQueues((prev) => {
      const list = prev[conversationId] ?? [];
      const att = list.find((a) => a.id === id);
      if (att) keysRef.current.get(conversationId)?.delete(fileKey(att.file));
      return { ...prev, [conversationId]: list.filter((a) => a.id !== id) };
    });
  }, []);

  const retryUpload = useCallback(
    (conversationId: string, id: string) => {
      setQueues((prev) => {
        const list = prev[conversationId] ?? [];
        const att = list.find((a) => a.id === id);
        if (!att) return prev;
        setTimeout(() => startUpload(conversationId, id, att.file), 0);
        return {
          ...prev,
          [conversationId]: list.map((a) =>
            a.id === id ? { ...a, status: 'pending', uploadProgress: 0, error: undefined } : a,
          ),
        };
      });
    },
    [startUpload],
  );

  const cancelUpload = useCallback((conversationId: string, id: string) => {
    const ck = ctrlKey(conversationId, id);
    const ctrl = controllersRef.current.get(ck);
    if (ctrl) {
      ctrl.abort();
      controllersRef.current.delete(ck);
    }
    setQueues((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] ?? []).map((a) =>
        a.id === id ? { ...a, status: 'canceled' } : a,
      ),
    }));
  }, []);

  const clearAttachments = useCallback((conversationId: string) => {
    // Abort all in-flight uploads for this conversation
    const prefix = `${conversationId}:`;
    controllersRef.current.forEach((ctrl, key) => {
      if (key.startsWith(prefix)) {
        ctrl.abort();
        controllersRef.current.delete(key);
      }
    });
    previewUrlsRef.current.forEach((url, key) => {
      if (key.startsWith(prefix)) {
        URL.revokeObjectURL(url);
        previewUrlsRef.current.delete(key);
      }
    });
    keysRef.current.delete(conversationId);
    setQueues((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, []);

  const getQueue = useCallback(
    (conversationId: string): ConvQueue => {
      const attachments = queues[conversationId] ?? [];
      return { attachments, ...deriveFlags(attachments) };
    },
    [queues],
  );

  return (
    <UploadQueueContext.Provider
      value={{ getQueue, addFiles, removeAttachment, retryUpload, cancelUpload, clearAttachments }}
    >
      {children}
    </UploadQueueContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook for consumers
// ---------------------------------------------------------------------------

export function useConversationUploadQueue(conversationId: string) {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error('useConversationUploadQueue must be used inside UploadQueueProvider');

  const { getQueue, addFiles, removeAttachment, retryUpload, cancelUpload, clearAttachments } = ctx;
  const queue = getQueue(conversationId);

  return {
    attachments: queue.attachments,
    allUploadsCompleted: queue.allUploadsCompleted,
    isUploading: queue.isUploading,
    addFiles: useCallback((files: FileList | File[]) => addFiles(conversationId, files), [addFiles, conversationId]),
    removeAttachment: useCallback((id: string) => removeAttachment(conversationId, id), [removeAttachment, conversationId]),
    retryUpload: useCallback((id: string) => retryUpload(conversationId, id), [retryUpload, conversationId]),
    cancelUpload: useCallback((id: string) => cancelUpload(conversationId, id), [cancelUpload, conversationId]),
    clearAttachments: useCallback(() => clearAttachments(conversationId), [clearAttachments, conversationId]),
  };
}

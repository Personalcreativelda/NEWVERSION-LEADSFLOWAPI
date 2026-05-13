/**
 * UploadQueueContext
 *
 * Global upload queue keyed by conversationId.
 * Uploads started in one conversation continue in the background even when the
 * user navigates to another conversation — uploads never cancel on unmount.
 *
 * Persistence (new):
 *   - After every state change the serialisable portion of the queue is written
 *     to IndexedDB (idbStore).
 *   - On mount, the provider reads IDB and restores:
 *       • 'uploaded' items — fully restored with their uploaded URLs.
 *       • Items that were 'uploading' or 'pending' when the page was closed —
 *         restored as status 'interrupted' with an informative error message.
 *         The user can discard them; since the File object is gone after a
 *         refresh, a true re-upload requires them to re-select the file.
 *   - Items with status 'canceled' are not persisted.
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
import {
    idbSaveUploadQueue,
    idbLoadUploadQueue,
    type PersistedAttachment,
} from '../lib/idbStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConvQueue {
    attachments:          AttachmentItem[];
    allUploadsCompleted:  boolean;
    isUploading:          boolean;
}

interface UploadQueueContextValue {
    getQueue:          (conversationId: string) => ConvQueue;
    addFiles:          (conversationId: string, files: FileList | File[]) => void;
    removeAttachment:  (conversationId: string, id: string) => void;
    retryUpload:       (conversationId: string, id: string) => void;
    cancelUpload:      (conversationId: string, id: string) => void;
    clearAttachments:  (conversationId: string) => void;
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

/** Convert the in-memory queue to the serialisable shape stored in IDB. */
function serialise(queues: Record<string, AttachmentItem[]>): PersistedAttachment[] {
    const result: PersistedAttachment[] = [];
    const now = Date.now();

    for (const [convId, items] of Object.entries(queues)) {
        for (const att of items) {
            if (att.status === 'canceled') continue;  // never persist cancellations

            if (att.status === 'uploaded' && att.uploadedUrl) {
                result.push({
                    id:                att.id,
                    conversationId:    convId,
                    name:              att.name,
                    size:              att.size,
                    mimeType:          att.mimeType,
                    fileType:          att.fileType,
                    uploadedUrl:       att.uploadedUrl,
                    uploadedMediaType: att.uploadedMediaType,
                    status:            'uploaded',
                    savedAt:           now,
                });
            } else if (att.status === 'uploading' || att.status === 'pending') {
                // File object is gone after refresh — mark as interrupted
                result.push({
                    id:             att.id,
                    conversationId: convId,
                    name:           att.name,
                    size:           att.size,
                    mimeType:       att.mimeType,
                    fileType:       att.fileType,
                    status:         'interrupted',
                    savedAt:        now,
                });
            }
            // 'failed' items are not persisted (they already show an error)
        }
    }
    return result;
}

/** Reconstruct AttachmentItem[] from persisted data. */
function deserialise(persisted: PersistedAttachment[]): Record<string, AttachmentItem[]> {
    const queues: Record<string, AttachmentItem[]> = {};

    for (const p of persisted) {
        if (!queues[p.conversationId]) queues[p.conversationId] = [];

        if (p.status === 'uploaded' && p.uploadedUrl) {
            queues[p.conversationId].push({
                id:                p.id,
                file:              new File([], p.name, { type: p.mimeType }),  // placeholder
                name:              p.name,
                size:              p.size,
                mimeType:          p.mimeType,
                fileType:          p.fileType,
                uploadProgress:    100,
                status:            'uploaded',
                uploadedUrl:       p.uploadedUrl,
                uploadedMediaType: p.uploadedMediaType,
            });
        } else {
            // Was mid-upload or pending when page closed
            queues[p.conversationId].push({
                id:           p.id,
                file:         new File([], p.name, { type: p.mimeType }),
                name:         p.name,
                size:         p.size,
                mimeType:     p.mimeType,
                fileType:     p.fileType,
                uploadProgress: 0,
                status:       'failed',
                error:        'Upload interrompido pelo recarregamento da página. Selecione o ficheiro novamente para tentar.',
            });
        }
    }
    return queues;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
    const [queues, setQueues] = useState<Record<string, AttachmentItem[]>>({});
    const [hydrated, setHydrated] = useState(false);

    const controllersRef  = useRef<Map<string, AbortController>>(new Map());
    const previewUrlsRef  = useRef<Map<string, string>>(new Map());
    const keysRef         = useRef<Map<string, Set<string>>>(new Map());
    /** Prevent saving to IDB during the initial hydration pass. */
    const skipNextSaveRef = useRef(true);

    // ── Restore from IDB on mount ─────────────────────────────────────────────
    useEffect(() => {
        idbLoadUploadQueue()
            .then((persisted) => {
                if (persisted && persisted.length > 0) {
                    const restored = deserialise(persisted);
                    // Rebuild the file-key dedup sets for the restored queues
                    for (const [convId, items] of Object.entries(restored)) {
                        const keys = new Set<string>();
                        for (const att of items) keys.add(`${att.name}|${att.size}|0`);
                        keysRef.current.set(convId, keys);
                    }
                    skipNextSaveRef.current = true;
                    setQueues(restored);
                }
            })
            .catch((e) => console.warn('[UploadQueue] IDB restore failed:', e))
            .finally(() => setHydrated(true));
    }, []);

    // ── Write-through to IDB on every state change ─────────────────────────
    useEffect(() => {
        if (!hydrated) return;
        if (skipNextSaveRef.current) {
            skipNextSaveRef.current = false;
            return;
        }
        const payload = serialise(queues);
        idbSaveUploadQueue(payload).catch((e) =>
            console.warn('[UploadQueue] IDB save failed:', e),
        );
    }, [queues, hydrated]);

    // Cleanup on provider unmount
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
                                  status:            'uploaded',
                                  uploadProgress:    100,
                                  uploadedUrl:       result.url,
                                  uploadedMediaType: result.media_type,
                                  error:             undefined,
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
                const id              = generateId();
                const fileType        = getFileType(file);
                const previewUrl      =
                    fileType === 'image' || fileType === 'video'
                        ? URL.createObjectURL(file)
                        : undefined;

                if (previewUrl) previewUrlsRef.current.set(ctrlKey(conversationId, id), previewUrl);
                convKeys.add(key);

                newAttachments.push({
                    id,
                    file,
                    name:           file.name,
                    size:           file.size,
                    mimeType:       file.type,
                    fileType,
                    previewUrl,
                    uploadProgress: 0,
                    status:         validationError ? 'failed' : 'pending',
                    error:          validationError ?? undefined,
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
        const ck   = ctrlKey(conversationId, id);
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
            const att  = list.find((a) => a.id === id);
            if (att) keysRef.current.get(conversationId)?.delete(fileKey(att.file));
            return { ...prev, [conversationId]: list.filter((a) => a.id !== id) };
        });
    }, []);

    /**
     * retryUpload only works for items that still have their File object
     * (items that failed mid-session).  Interrupted items (restored from IDB)
     * have a placeholder File — calling retry would fail immediately.
     * Those items show a different error message prompting re-selection.
     */
    const retryUpload = useCallback(
        (conversationId: string, id: string) => {
            setQueues((prev) => {
                const list = prev[conversationId] ?? [];
                const att  = list.find((a) => a.id === id);
                if (!att) return prev;
                // Don't retry interrupted items — their File is a placeholder
                if (att.error?.includes('recarregamento')) return prev;
                setTimeout(() => startUpload(conversationId, id, att.file), 0);
                return {
                    ...prev,
                    [conversationId]: list.map((a) =>
                        a.id === id
                            ? { ...a, status: 'pending', uploadProgress: 0, error: undefined }
                            : a,
                    ),
                };
            });
        },
        [startUpload],
    );

    const cancelUpload = useCallback((conversationId: string, id: string) => {
        const ck   = ctrlKey(conversationId, id);
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
        attachments:         queue.attachments,
        allUploadsCompleted: queue.allUploadsCompleted,
        isUploading:         queue.isUploading,
        addFiles:            useCallback((files: FileList | File[]) => addFiles(conversationId, files), [addFiles, conversationId]),
        removeAttachment:    useCallback((id: string) => removeAttachment(conversationId, id), [removeAttachment, conversationId]),
        retryUpload:         useCallback((id: string) => retryUpload(conversationId, id), [retryUpload, conversationId]),
        cancelUpload:        useCallback((id: string) => cancelUpload(conversationId, id), [cancelUpload, conversationId]),
        clearAttachments:    useCallback(() => clearAttachments(conversationId), [clearAttachments, conversationId]),
    };
}

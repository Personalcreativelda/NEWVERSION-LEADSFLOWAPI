/**
 * Low-level IndexedDB stores for data that doesn't go through TanStack Query:
 *   - Message cache (module-level singleton, large per-conversation data)
 *   - Upload queue (serialisable metadata only — File objects cannot persist)
 */
import { get, set, del, keys, clear, createStore } from 'idb-keyval';
import type { AttachmentFileType } from '../types/attachment';

// ── Message cache store ───────────────────────────────────────────────────────

const MESSAGE_STORE = createStore('leadflow-messages-db', 'messages');

/** Sobe quando o formato muda: as cópias de outra versão são ignoradas.
 *  2 = as mais recentes primeiro (antes eram guardadas as 100 mais antigas de cada conversa) */
export const MESSAGE_CACHE_VERSION = 2;

export interface IdbMessageEntry {
    messages: unknown[];
    savedAt:  number;
    v?:       number;
}

export async function idbSaveMessages(conversationId: string, messages: unknown[]): Promise<void> {
    await set(conversationId, { messages, savedAt: Date.now(), v: MESSAGE_CACHE_VERSION } satisfies IdbMessageEntry, MESSAGE_STORE);
}

export async function idbLoadMessages(conversationId: string): Promise<IdbMessageEntry | undefined> {
    return get<IdbMessageEntry>(conversationId, MESSAGE_STORE);
}

export async function idbLoadAllMessageKeys(): Promise<string[]> {
    const k = await keys(MESSAGE_STORE);
    return k as string[];
}

export async function idbDeleteMessages(conversationId: string): Promise<void> {
    return del(conversationId, MESSAGE_STORE);
}

export async function idbClearMessages(): Promise<void> {
    return clear(MESSAGE_STORE);
}

// ── Upload queue persistence store ───────────────────────────────────────────

const UPLOAD_STORE = createStore('leadflow-uploads-db', 'uploads');
const UPLOAD_KEY   = 'queue';

export interface PersistedAttachment {
    id:               string;
    conversationId:   string;
    name:             string;
    size:             number;
    mimeType:         string;
    fileType:         AttachmentFileType;
    /** Only present for items that finished uploading before the page was refreshed. */
    uploadedUrl?:     string;
    uploadedMediaType?: AttachmentFileType;
    /** Items mid-upload or pending when page closed are marked 'interrupted'. */
    status:           'uploaded' | 'interrupted';
    savedAt:          number;
}

export async function idbSaveUploadQueue(items: PersistedAttachment[]): Promise<void> {
    await set(UPLOAD_KEY, items, UPLOAD_STORE);
}

export async function idbLoadUploadQueue(): Promise<PersistedAttachment[] | undefined> {
    return get<PersistedAttachment[]>(UPLOAD_KEY, UPLOAD_STORE);
}

export async function idbClearUploadQueue(): Promise<void> {
    return del(UPLOAD_KEY, UPLOAD_STORE);
}

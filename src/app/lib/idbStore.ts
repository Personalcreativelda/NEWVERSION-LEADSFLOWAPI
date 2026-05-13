/**
 * Low-level IndexedDB stores for data that doesn't go through TanStack Query:
 *   - Message cache (module-level singleton, large per-conversation data)
 *   - Upload queue (serialisable metadata only — File objects cannot persist)
 */
import { get, set, del, keys, createStore } from 'idb-keyval';
import type { AttachmentFileType } from '../types/attachment';

// ── Message cache store ───────────────────────────────────────────────────────

const MESSAGE_STORE = createStore('leadflow-messages-db', 'messages');

export interface IdbMessageEntry {
    messages: unknown[];
    savedAt:  number;
}

export async function idbSaveMessages(conversationId: string, messages: unknown[]): Promise<void> {
    await set(conversationId, { messages, savedAt: Date.now() } satisfies IdbMessageEntry, MESSAGE_STORE);
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

/**
 * IndexedDB persister for TanStack Query.
 *
 * The entire query cache is serialised into a single IDB entry so that
 * on next page load every query that was still within its gcTime is
 * restored instantly before any network request fires.
 *
 * Max age: 24 h — stale cache entries beyond this are discarded so
 * the persisted blob never grows unbounded.
 */
import { get, set, del, createStore } from 'idb-keyval';
import type { Persister } from '@tanstack/react-query-persist-client';

const IDB_KEY   = 'leadflow-query-cache-v1';
const idbStore  = createStore('leadflow-query-db', 'query-cache');

export const idbPersister: Persister = {
    persistClient: async (client) => {
        await set(IDB_KEY, client, idbStore);
    },
    restoreClient: async () => {
        return await get(IDB_KEY, idbStore);
    },
    removeClient: async () => {
        await del(IDB_KEY, idbStore);
    },
};

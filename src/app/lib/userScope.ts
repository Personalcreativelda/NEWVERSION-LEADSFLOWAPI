// Dados da conta guardados no aparelho que não sabem de quem são (conversa aberta, rascunhos,
// cópia das mensagens e da lista de conversas). Ao sair ou ao entrar com outra conta são
// apagados — antes a conversa da conta anterior ficava no ecrã ("congelada").
import { useInboxStore } from '../stores/inboxStore';
import { clearMessageCache } from '../hooks/useMessageCache';
import { queryClient } from './queryClient';
import { idbPersister } from './idbPersister';

const OWNER_KEY = 'leadsflow_data_owner';
const INBOX_UI_KEY = 'leadflow-inbox-ui';
const REMARKETING_KEY = 'remarketing_flows_local';

export async function clearUserScopedData(): Promise<void> {
  useInboxStore.setState({
    activeConversationId: null,
    lastSelectedConversation: null,
    draftMessages: {},
    searchQuery: '',
  });
  try {
    localStorage.removeItem(INBOX_UI_KEY);
    localStorage.removeItem(REMARKETING_KEY);
  } catch { /* sem armazenamento */ }
  queryClient.clear();
  await Promise.all([
    clearMessageCache().catch(() => {}),
    Promise.resolve(idbPersister.removeClient()).catch(() => {}),
  ]);
}

/** Ao entrar: se os dados guardados forem de outra conta (ou de dono desconhecido), apaga-os */
export async function ensureDataOwner(userId: string): Promise<void> {
  let owner: string | null = null;
  try { owner = localStorage.getItem(OWNER_KEY); } catch { /* sem armazenamento */ }
  if (owner === userId) return;
  await clearUserScopedData();
  try { localStorage.setItem(OWNER_KEY, userId); } catch { /* sem armazenamento */ }
}

/** Ao sair: apaga e esquece o dono */
export async function forgetDataOwner(): Promise<void> {
  await clearUserScopedData();
  try { localStorage.removeItem(OWNER_KEY); } catch { /* sem armazenamento */ }
}

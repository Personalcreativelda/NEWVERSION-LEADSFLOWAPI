// Shared in-memory typing state for website widget conversations
// conversationId → { agentName, expiresAt }
const store = new Map<string, { agentName: string; expiresAt: number }>();

export const widgetTyping = {
  set(conversationId: string, agentName: string) {
    store.set(conversationId, { agentName, expiresAt: Date.now() + 6000 });
  },
  clear(conversationId: string) {
    store.delete(conversationId);
  },
  get(conversationId: string): { typing: boolean; agentName?: string } {
    const s = store.get(conversationId);
    if (!s || Date.now() > s.expiresAt) {
      store.delete(conversationId);
      return { typing: false };
    }
    return { typing: true, agentName: s.agentName };
  },
};

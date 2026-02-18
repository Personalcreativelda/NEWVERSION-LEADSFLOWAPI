import React from 'react';
import InboxConversations from './inbox/InboxConversations';
import InboxSettings from './inbox/InboxSettings';
import AssistantsPage from './AssistantsPage';
import VoiceAgentsPage from './VoiceAgentsPage';
import InboxAutomations from './inbox/InboxAutomations';

interface InboxPageProps {
    isDark: boolean;
    leads: any[];
    currentSubPage?: string;
    onNavigate?: (page: string) => void;
    conversationIdToOpen?: string | null;
    onConversationOpened?: () => void;
}

export default function InboxPage({ 
    isDark, 
    leads, 
    currentSubPage = 'conversations', 
    onNavigate,
    conversationIdToOpen,
    onConversationOpened
}: InboxPageProps) {
    // Renderiza a subpágina baseada no currentSubPage
    const renderContent = () => {
        switch (currentSubPage) {
            case 'inbox-settings':
            case 'settings':
                return <InboxSettings />;
            case 'ai-assistants':
            case 'assistants':
                return <AssistantsPage isDark={isDark} />;
            case 'voice-agents':
                return <VoiceAgentsPage isDark={isDark} />;
            case 'automations':
                return <InboxAutomations />;
            case 'inbox':
            case 'conversations':
            default:
                return (
                    <InboxConversations 
                        onNavigate={onNavigate}
                        conversationIdToOpen={conversationIdToOpen}
                        onConversationOpened={onConversationOpened}
                    />
                );
        }
    };

    return (
        <div className="h-full w-full flex flex-col overflow-hidden" style={{ maxWidth: 'none' }}>
            <div className="flex-1 min-h-0 overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
}

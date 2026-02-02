import React from 'react';
import InboxConversations from './inbox/InboxConversations';
import InboxSettings from './inbox/InboxSettings';
import InboxAssistants from './inbox/InboxAssistants';
import InboxAutomations from './inbox/InboxAutomations';

interface InboxPageProps {
    isDark: boolean;
    leads: any[];
    currentSubPage?: string;
    onNavigate?: (page: string) => void;
}

export default function InboxPage({ isDark, leads, currentSubPage = 'conversations', onNavigate }: InboxPageProps) {
    // Renderiza a subpágina baseada no currentSubPage
    const renderContent = () => {
        switch (currentSubPage) {
            case 'inbox-settings':
            case 'settings':
                return <InboxSettings />;
            case 'ai-assistants':
            case 'assistants':
                return <InboxAssistants />;
            case 'automations':
                return <InboxAutomations />;
            case 'inbox':
            case 'conversations':
            default:
                return <InboxConversations onNavigate={onNavigate} />;
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

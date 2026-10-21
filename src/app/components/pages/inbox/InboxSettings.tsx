import { Radio } from 'lucide-react';
import { ChannelsList } from '../../inbox/channels/ChannelsList';
import { PageHeader } from '../../base/PageHeader';

export default function InboxSettings() {
    return (
        // Página de ecrã inteiro (dentro do InboxPage): mesmas margens do PageContainer do Dashboard
        <div className="h-full min-w-0 flex flex-col overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8" style={{ backgroundColor: 'hsl(var(--background))' }}>
            <PageHeader title="Canais" description="Os seus canais de comunicação ligados à Inbox" icon={Radio} />

            <div className="flex-1 min-h-0 overflow-auto">
                <ChannelsList />
            </div>
        </div>
    );
}

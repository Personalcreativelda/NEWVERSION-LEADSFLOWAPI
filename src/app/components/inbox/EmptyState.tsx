// INBOX: Empty state - modern ManyChat-style
import { MessageSquare } from 'lucide-react';
import { ChannelLogo } from '../base/ChannelLogo';

const CHANNELS = [
    { type: 'whatsapp', label: 'WhatsApp' },
    { type: 'instagram', label: 'Instagram' },
    { type: 'facebook', label: 'Messenger' },
    { type: 'telegram', label: 'Telegram' },
    { type: 'email', provider: 'gmail', label: 'Gmail' },
    { type: 'website', label: 'Site' },
];

interface EmptyStateProps {
    onOpenSettings?: () => void;
}

export function EmptyState({ onOpenSettings }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <MessageSquare size={36} className="text-primary" />
            </div>

            <h3 className="text-xl font-semibold mb-2 text-foreground">
                Selecione uma conversa
            </h3>

            <p className="text-sm mb-8 leading-relaxed text-muted-foreground">
                Escolha uma conversa à esquerda para começar a interagir com seus leads.
            </p>

            <button
                onClick={onOpenSettings}
                className="flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.97] bg-primary text-primary-foreground"
            >
                Configurar canais
            </button>

            <div className="mt-10 grid grid-cols-3 gap-x-8 gap-y-5">
                {CHANNELS.map(({ type, provider, label }) => (
                    <div key={label} className="flex flex-col items-center gap-2 text-xs font-medium text-muted-foreground">
                        <ChannelLogo type={type} provider={provider} className="h-11 w-11" />
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}

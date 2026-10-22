import { MessageCircle, Mail, MessageSquare, ChevronRight } from 'lucide-react';
import { AppModal } from '../base/AppModal';

interface ChannelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChannel: (channel: 'whatsapp' | 'email' | 'sms') => void;
}

const CHANNELS = [
  {
    id: 'whatsapp' as const,
    name: 'WhatsApp',
    icon: MessageCircle,
    description: 'Mensagens diretas e personalizadas',
    iconClass: 'bg-[#25D366]/12 text-[#1DA851] dark:text-[#25D366]',
    hoverClass: 'hover:border-[#25D366]/60',
  },
  {
    id: 'email' as const,
    name: 'Email',
    icon: Mail,
    description: 'Campanhas profissionais por email',
    iconClass: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    hoverClass: 'hover:border-blue-500/60',
  },
  {
    id: 'sms' as const,
    name: 'SMS',
    icon: MessageSquare,
    description: 'Mensagens curtas via Twilio',
    iconClass: 'bg-[#F22F46]/12 text-[#E11D48] dark:text-[#FB7185]',
    hoverClass: 'hover:border-[#F22F46]/60',
  },
];

/**
 * Escolha do canal de uma campanha nova. Telemóvel: linhas tocáveis (ícone, texto, ›).
 * Desktop: três cartões lado a lado. O cartão inteiro é o botão.
 */
export default function ChannelSelectorModal({ isOpen, onClose, onSelectChannel }: ChannelSelectorModalProps) {
  return (
    <AppModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title="Nova campanha"
      description="Escolha o canal de envio"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {CHANNELS.map((channel, index) => {
          const Icon = channel.icon;
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => {
                onSelectChannel(channel.id);
                onClose();
              }}
              style={{ animationDelay: `${index * 60}ms` }}
              className={`group flex sm:flex-col items-center gap-3.5 sm:gap-3 rounded-xl border border-border bg-card p-3.5 sm:p-5 text-left sm:text-center
                transition-all duration-200 hover:shadow-md sm:hover:-translate-y-0.5 active:scale-[0.98]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${channel.hoverClass}`}
            >
              <span className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${channel.iconClass}`}>
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">{channel.name}</span>
                <span className="block text-[13px] text-muted-foreground mt-0.5 leading-snug">{channel.description}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:hidden" />
            </button>
          );
        })}
      </div>
    </AppModal>
  );
}

import { type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';

export type MessageCenterTab = 'plan' | 'alerts' | 'updates';

export interface MessageCenterAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  icon?: ReactNode;
}

export interface MessageCenterMessage {
  id: string;
  title: string;
  content: ReactNode;
  tone?: 'default' | 'warning' | 'success' | 'danger';
  badgeLabel?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline';
  icon?: ReactNode;
  actions?: MessageCenterAction[];
  footer?: ReactNode;
}

export interface MessageCenterSection {
  id: MessageCenterTab;
  label: string;
  description?: ReactNode;
  messages: MessageCenterMessage[];
}

interface MessageCenterModalProps {
  open: boolean;
  onClose: () => void;
  sections: MessageCenterSection[];
  activeTab: MessageCenterTab;
  onTabChange: (tab: MessageCenterTab) => void;
  highlightMessageId?: string;
}

// Tom de cada aviso: só a cor do ícone; o cartão é sempre neutro
const toneIcon: Record<NonNullable<MessageCenterMessage['tone']>, string> = {
  default: 'text-muted-foreground',
  warning: 'text-amber-500',
  success: 'text-emerald-500',
  danger: 'text-red-500',
};

export default function MessageCenterModal({
  open,
  onClose,
  sections,
  activeTab,
  onTabChange,
  highlightMessageId,
}: MessageCenterModalProps) {
  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <DialogContent className="max-w-[520px] gap-0 p-0 sm:p-0 overflow-hidden">
        <div className="shrink-0 px-5 pt-5 pb-3 pr-12 sm:px-6">
          <DialogTitle>Mensagens</DialogTitle>
          <DialogDescription className="sr-only">Avisos do plano, alertas e novidades</DialogDescription>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as MessageCenterTab)} className="flex min-h-0 flex-col gap-0">
          {/* Separadores sublinhados, como no resto do app; fazem scroll se não couberem */}
          <TabsList className="flex h-auto w-full shrink-0 justify-start gap-5 overflow-x-auto rounded-none border-b border-border bg-transparent px-5 py-0 sm:px-6">
            {sections.map((section) => (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="h-10 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {section.label}
                {section.messages.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{section.messages.length}</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          {sections.map((section) => (
            <TabsContent key={section.id} value={section.id} className="mt-0 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 max-h-[60dvh]">
              {section.messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem mensagens.</p>
              ) : (
                <div className="space-y-3 pb-[env(safe-area-inset-bottom)]">
                  {section.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'rounded-xl border border-border bg-muted/30 p-4',
                        highlightMessageId === message.id && 'border-foreground/25',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {message.icon && <div className={cn('mt-0.5 shrink-0 [&_svg]:text-current', toneIcon[message.tone ?? 'default'])}>{message.icon}</div>}
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="text-base font-semibold text-foreground">{message.title}</h3>
                          <div className="text-sm leading-relaxed text-muted-foreground">{message.content}</div>
                          {message.footer && <div className="text-xs text-muted-foreground">{message.footer}</div>}
                        </div>
                      </div>

                      {message.actions && message.actions.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {message.actions.map((action) => (
                            <Button key={action.label} onClick={action.onClick} variant={action.variant ?? 'default'} size="sm">
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

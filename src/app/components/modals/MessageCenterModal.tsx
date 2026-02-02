import { type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';
import { BellRing, Crown, Sparkles, X } from 'lucide-react';

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

const tabIcons: Record<MessageCenterTab, ReactNode> = {
  plan: <Crown className="size-4" />, // Plano & limites
  alerts: <BellRing className="size-4" />, // Alertas
  updates: <Sparkles className="size-4" />, // Novidades
};

const toneStyles: Record<NonNullable<MessageCenterMessage['tone']>, string> = {
  default: 'message-tone-default',
  warning: 'message-tone-warning',
  success: 'message-tone-success',
  danger: 'message-tone-danger',
};

export default function MessageCenterModal({
  open,
  onClose,
  sections,
  activeTab,
  onTabChange,
  highlightMessageId,
}: MessageCenterModalProps) {
  const handleTabValueChange = (value: string) => {
    onTabChange(value as MessageCenterTab);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-w-[520px] overflow-hidden rounded-2xl border border-border p-0 shadow-2xl [&>[data-slot='dialog-close']]:hidden">
        <div className="flex items-start justify-between border-b border-border/70 px-6 py-4">
          <div className="space-y-1">
            <DialogTitle className="text-lg font-semibold">Central de Mensagens</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Veja avisos do plano, alertas recentes e confirmações importantes.
            </DialogDescription>
          </div>
          <Button aria-label="Fechar" variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={handleTabValueChange}
          className="flex flex-col gap-0"
        >
          <div className="px-6 pt-4">
            <TabsList className="flex w-full justify-start gap-2 rounded-xl border border-border bg-secondary p-1">
              {sections.map((section) => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className={cn(
                    'flex-1 min-w-[120px] rounded-lg px-3 py-2 text-sm font-medium transition',
                    'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
                    'data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-muted/80 dark:data-[state=inactive]:text-neutral-400 dark:hover:data-[state=inactive]:bg-neutral-800/80',
                  )}
                >
                  <span className="mr-2 text-primary/80">
                    {tabIcons[section.id]}
                  </span>
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="px-6 pb-6 pt-4">
            {sections.map((section) => (
              <TabsContent
                key={section.id}
                value={section.id}
                className="mt-0"
              >
                {section.description && (
                  <p className="mb-4 text-sm text-muted-foreground">
                    {section.description}
                  </p>
                )}

                <ScrollArea className="max-h-[60vh] pr-1">
                  <div className="space-y-4 pb-2">
                    {section.messages.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border/60 bg-muted p-6 text-center text-sm text-muted-foreground">
                        Nenhuma mensagem por aqui ainda.
                      </div>
                    )}

                    {section.messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'message-card rounded-xl border p-4 shadow-sm',
                          toneStyles[message.tone ?? 'default'] ?? toneStyles.default,
                          highlightMessageId === message.id && 'ring-2 ring-primary/40 dark:ring-primary/60',
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-1 items-start gap-3">
                            {message.icon && (
                              <div className="mt-1 text-primary">
                                {message.icon}
                              </div>
                            )}
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-semibold">
                                  {message.title}
                                </h3>
                                {message.badgeLabel && (
                                  <Badge variant={message.badgeVariant ?? 'secondary'}>
                                    {message.badgeLabel}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm leading-relaxed text-muted-foreground">
                                {message.content}
                              </div>
                            </div>
                          </div>
                        </div>

                        {message.actions && message.actions.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {message.actions.map((action) => (
                              <Button
                                key={action.label}
                                onClick={action.onClick}
                                variant={action.variant ?? 'default'}
                                size="sm"
                              >
                                {action.icon}
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        )}

                        {message.footer && (
                          <div className="mt-3 text-xs text-muted-foreground/80">
                            {message.footer}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

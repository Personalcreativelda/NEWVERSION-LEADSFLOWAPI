/**
 * Reusable skeleton components — shaped to match the real UI so loading
 * transitions feel smooth and professional.
 *
 * All skeletons use the base <Skeleton> which drives .skeleton-shimmer animation.
 * Dark-mode colours are handled via CSS variables (--skeleton-base / --skeleton-highlight).
 */
import { Skeleton } from './skeleton';
import { cn } from './utils';

// ── Inline "Atualizando..." badge ─────────────────────────────────────────────
export function UpdatingBadge({ className }: { className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-muted',
      className,
    )}>
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      Atualizando...
    </span>
  );
}

// ── Stat card (MainStatsCards / StatsCards) ───────────────────────────────────
export function SkeletonStatCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function SkeletonStatCardsRow({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => <SkeletonStatCard key={i} />)}
    </div>
  );
}

// ── Campaign card ─────────────────────────────────────────────────────────────
export function SkeletonCampaignCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-6 flex flex-col gap-4">
      {/* Header: name + status dot + kebab */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-7 w-7 rounded-md flex-shrink-0" />
      </div>
      {/* Progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      {/* Stats 2×2 grid */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 flex-1 rounded-md" />
      </div>
    </div>
  );
}

export function SkeletonCampaignSection({ count = 3, withTitle = true }: { count?: number; withTitle?: boolean }) {
  return (
    <section className="space-y-4">
      {withTitle && (
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-8 rounded-full" />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: count }).map((_, i) => <SkeletonCampaignCard key={i} />)}
      </div>
    </section>
  );
}

// ── Conversation item (ConversationList) ──────────────────────────────────────
export function SkeletonConversationItem() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-border/50">
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-10 flex-shrink-0" />
        </div>
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
  );
}

export function SkeletonConversationList({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonConversationItem key={i} />
      ))}
    </div>
  );
}

// ── Message bubble (ChatPanel) ────────────────────────────────────────────────
export function SkeletonMessageBubble({ isOut = false, width = 'md' }: { isOut?: boolean; width?: 'sm' | 'md' | 'lg' }) {
  const widths = { sm: 'w-36', md: 'w-52', lg: 'w-72' };
  return (
    <div className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'} mb-2 px-4`}>
      <div className={cn('rounded-lg p-3 flex flex-col gap-1.5', widths[width],
        isOut ? 'bg-[hsl(var(--skeleton-base))]' : 'bg-[hsl(var(--skeleton-base))]'
      )}>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-12 self-end mt-0.5" />
      </div>
    </div>
  );
}

// ── Lead table row ────────────────────────────────────────────────────────────
export function SkeletonLeadRow() {
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-4">
        <Skeleton className="h-5 w-5 rounded" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-3.5 w-20" />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-3.5 w-36" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-3.5 w-24" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-3.5 w-20" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-3.5 w-20" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 rounded-full" />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </td>
    </tr>
  );
}

// ── Remarketing flow card ─────────────────────────────────────────────────────
export function SkeletonFlowCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Left */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          {/* Trigger */}
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
          {/* Steps */}
          <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1">
                <Skeleton className="h-6 w-16 rounded-md" />
                {i < 2 && <Skeleton className="h-3 w-3 rounded-sm" />}
              </div>
            ))}
          </div>
        </div>
        {/* Right stats */}
        <div className="flex sm:flex-col gap-4 sm:gap-2 sm:items-end flex-shrink-0">
          <div className="flex flex-col gap-1 items-end">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="flex flex-col gap-1 items-end">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-10" />
          </div>
        </div>
      </div>
      {/* Actions */}
      <div className="flex gap-2 mt-4 pt-3 border-t border-border">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md ml-auto" />
      </div>
    </div>
  );
}

// ── Sales Funnel kanban ───────────────────────────────────────────────────────
function SkeletonFunnelLeadCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-3 w-24" />
      <div className="flex gap-1.5 pt-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-6 rounded" />
        ))}
      </div>
    </div>
  );
}

function SkeletonFunnelColumn({ cardCount = 2 }: { cardCount?: number }) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-6 rounded-full" />
        </div>
        <Skeleton className="h-5 w-5 rounded" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonFunnelLeadCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonFunnel() {
  const cardCounts = [3, 1, 1, 1, 1];
  return (
    <div className="flex flex-col gap-5">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {cardCounts.map((count, i) => (
          <SkeletonFunnelColumn key={i} cardCount={count} />
        ))}
      </div>
    </div>
  );
}

// ── Plan limit cards (PlanoWidget) ────────────────────────────────────────────
export function SkeletonLimitCard() {
  return (
    <div className="bg-card rounded-xl p-4 sm:p-5 border border-border flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  );
}

export function SkeletonLimitCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
      {Array.from({ length: 3 }).map((_, i) => <SkeletonLimitCard key={i} />)}
    </div>
  );
}

// ── Channel option card (ChannelsList "Add new") ──────────────────────────────
export function SkeletonChannelCard() {
  return (
    <div className="flex flex-col items-start p-5 border border-border rounded-lg bg-card gap-2">
      <Skeleton className="h-14 w-14 rounded-lg mb-1" />
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonChannelGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonChannelCard key={i} />)}
    </div>
  );
}

// ── Assistant card (Marketplace / My Assistants) ─────────────────────────────
export function SkeletonAssistantCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      {/* Top: icon + badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-5 w-12 rounded-full flex-shrink-0" />
      </div>
      {/* Description */}
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      {/* Tags */}
      <div className="flex gap-1.5 flex-wrap">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      {/* Action button */}
      <Skeleton className="h-9 w-full rounded-lg mt-1" />
    </div>
  );
}

export function SkeletonAssistantGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonAssistantCard key={i} />)}
    </div>
  );
}

// ── Voice agent card ─────────────────────────────────────────────────────────
export function SkeletonVoiceAgentCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-3 rounded-sm" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-3 rounded-sm" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

export function SkeletonVoiceAgentGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonVoiceAgentCard key={i} />)}
    </div>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────────
export function SkeletonPlanCard() {
  return (
    <div className="bg-card border-2 border-border rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-xl flex-shrink-0" />
        <Skeleton className="h-6 w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex flex-col gap-2.5 flex-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-4 w-4 rounded-sm flex-shrink-0" />
            <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-40' : 'w-32'}`} />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-lg mt-2" />
    </div>
  );
}

export function SkeletonPlanCards() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {Array.from({ length: 3 }).map((_, i) => <SkeletonPlanCard key={i} />)}
    </div>
  );
}

// ── Webhook settings form ─────────────────────────────────────────────────────
export function SkeletonWebhookForm() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-36" />
            </div>
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="px-6 py-4 flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
            <div className="rounded-lg border border-border bg-muted/50 p-4 flex flex-col gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-52" />
              <Skeleton className="h-9 w-full rounded-md mt-1" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
    </div>
  );
}

// ── AI insight row ────────────────────────────────────────────────────────────
export function SkeletonInsightRow() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-5 w-14 rounded-full flex-shrink-0" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <Skeleton className="h-7 w-7 rounded" />
        <Skeleton className="h-7 w-7 rounded" />
      </div>
    </div>
  );
}

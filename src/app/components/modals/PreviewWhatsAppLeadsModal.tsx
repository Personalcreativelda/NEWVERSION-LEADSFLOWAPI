import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { LogoBox } from '../base/LogoBox';
import { SearchInput } from '../base/SearchInput';
import { matchesSearch } from '../../utils/search';
import { cn } from '../ui/utils';

export interface WhatsAppContact {
  nome: string;
  numero: string;
  avatar?: string | null;
  /** O número já é um lead (não se importa outra vez) */
  existing?: boolean;
}

interface PreviewWhatsAppLeadsModalProps {
  isOpen: boolean;
  contacts: WhatsAppContact[];
  onClose: () => void;
  onImport: (contacts: WhatsAppContact[]) => void;
  loading?: boolean;
  userPlan?: string;
  currentLeadsCount?: number;
  leadsLimit?: number;
  existingLeads?: Array<{ telefone?: string; email?: string }>;
  dataSource?: string;
}

type Filter = 'new' | 'all' | 'photo' | 'named' | 'existing';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'new', label: 'Novos' },
  { value: 'all', label: 'Todos' },
  { value: 'photo', label: 'Com foto' },
  { value: 'named', label: 'Com nome' },
  { value: 'existing', label: 'Já são leads' },
];

const PAGE = 100;
const hasName = (c: WhatsAppContact) => !!c.nome && c.nome.replace(/\D/g, '') !== c.numero.replace(/\D/g, '');

function Avatar({ contact }: { contact: WhatsAppContact }) {
  const [broken, setBroken] = useState(false);
  const initials = hasName(contact)
    ? contact.nome.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '#';
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
      {contact.avatar && !broken ? (
        <img src={contact.avatar} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span translate="no">{initials}</span>
      )}
    </span>
  );
}

export default function PreviewWhatsAppLeadsModal({
  isOpen,
  contacts,
  onClose,
  onImport,
  loading = false,
  currentLeadsCount,
  leadsLimit,
}: PreviewWhatsAppLeadsModalProps) {
  const [filter, setFilter] = useState<Filter>('new');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);
  // Por omissão ficam escolhidos todos os que ainda não são leads
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(contacts.filter((c) => !c.existing).map((c) => c.numero)),
  );

  const counts = useMemo(() => ({
    new: contacts.filter((c) => !c.existing).length,
    all: contacts.length,
    photo: contacts.filter((c) => !!c.avatar).length,
    named: contacts.filter(hasName).length,
    existing: contacts.filter((c) => c.existing).length,
  }), [contacts]);

  const shown = useMemo(() => contacts.filter((c) => {
    if (filter === 'new' && c.existing) return false;
    if (filter === 'photo' && !c.avatar) return false;
    if (filter === 'named' && !hasName(c)) return false;
    if (filter === 'existing' && !c.existing) return false;
    return !search || matchesSearch(search, c.nome, c.numero);
  }), [contacts, filter, search]);

  const selectable = shown.filter((c) => !c.existing);
  const allShownSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.numero));

  // Limite do plano: só cabem estes leads
  const slots = leadsLimit !== undefined && leadsLimit !== -1 && currentLeadsCount !== undefined
    ? Math.max(0, leadsLimit - currentLeadsCount)
    : Infinity;
  const toImport = contacts.filter((c) => !c.existing && selected.has(c.numero));
  const importCount = Math.min(toImport.length, slots);

  const toggle = (numero: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(numero)) next.delete(numero); else next.add(numero);
    return next;
  });

  const toggleAllShown = () => setSelected((prev) => {
    const next = new Set(prev);
    selectable.forEach((c) => (allShownSelected ? next.delete(c.numero) : next.add(c.numero)));
    return next;
  });

  return (
    <AppModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="p-0 gap-0 max-h-[90vh] flex flex-col"
      logo={<LogoBox brand="whatsapp" />}
      title="Contactos do WhatsApp"
      description={`${contacts.length} contactos com WhatsApp`}
      bodyClassName="px-0 py-0 sm:px-0"
      footer={
        <>
          <AppButton variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </AppButton>
          <AppButton onClick={() => onImport(toImport.slice(0, importCount))} disabled={loading || importCount === 0}>
            {loading ? 'A importar…' : `Importar ${importCount}`}
          </AppButton>
        </>
      }
    >
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background px-5 py-3 sm:px-6">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setVisible(PAGE); }} placeholder="Pesquisar por nome ou número" />
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setFilter(f.value); setVisible(PAGE); }}
              className={cn(
                'flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f.value
                  ? 'border-foreground/25 bg-muted text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label} <span className="tabular-nums opacity-70" translate="no">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        {slots < toImport.length && (
          <p className="text-xs text-muted-foreground">{`O seu plano permite mais ${slots} leads: serão importados os primeiros ${slots}.`}</p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nenhum contacto</p>
      ) : (
        <ul className="divide-y divide-border">
          {selectable.length > 0 && (
            <li>
              <button type="button" onClick={toggleAllShown} className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 sm:px-6">
                <span className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2', allShownSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                  {allShownSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                Selecionar todos <span className="text-muted-foreground tabular-nums" translate="no">({selectable.length})</span>
              </button>
            </li>
          )}
          {shown.slice(0, visible).map((c) => {
            const checked = !c.existing && selected.has(c.numero);
            return (
              <li key={c.numero}>
                <button
                  type="button"
                  disabled={c.existing}
                  onClick={() => toggle(c.numero)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors enabled:hover:bg-muted/50 sm:px-6"
                >
                  <span className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40', c.existing && 'opacity-40')}>
                    {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <Avatar contact={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground" translate="no">{hasName(c) ? c.nome : c.numero}</span>
                    {hasName(c) && <span className="block truncate text-xs text-muted-foreground" translate="no">{c.numero}</span>}
                  </span>
                  {c.existing && <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Já é lead</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {shown.length > visible && (
        <div className="flex justify-center px-6 py-4">
          <AppButton variant="outline" onClick={() => setVisible((v) => v + PAGE)}>Ver mais</AppButton>
        </div>
      )}
    </AppModal>
  );
}

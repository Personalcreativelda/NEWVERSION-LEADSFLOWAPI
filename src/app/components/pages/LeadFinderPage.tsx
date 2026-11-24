// Encontrar leads: pesquisa empresas no Google Maps (API oficial) e importa as escolhidas como leads.
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, MapPin, Phone, Search, Star } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { PageHeader } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface Place {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  category: string | null;
  mapsUrl: string | null;
  existing?: boolean;
}

export default function LeadFinderPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    apiRequest('/lead-finder/usage', 'GET')
      .then((r) => { setConfigured(!!r?.configured); setUsage(r?.usage || null); })
      // Sem resposta (ex.: sem rede) mostra o formulário: o aviso de servidor em baixo já aparece
      .catch(() => setConfigured(true));
  }, []);

  const selectable = useMemo(() => places.filter((p) => !p.existing), [places]);
  const atLimit = !!usage && usage.used >= usage.limit;

  const search = async (more = false) => {
    const q = more ? lastQuery : what.trim();
    if (!q) return;
    setSearching(true);
    try {
      const r = await apiRequest('/lead-finder/search', 'POST', {
        query: more ? lastQuery : q,
        location: more ? undefined : where.trim(),
        ...(more && nextPageToken ? { pageToken: nextPageToken } : {}),
      });
      const found: Place[] = r?.places || [];
      setPlaces((prev) => (more ? [...prev, ...found.filter((p) => !prev.some((x) => x.id === p.id))] : found));
      if (!more) {
        setSelected(new Set(found.filter((p) => !p.existing && p.phone).map((p) => p.id)));
        setLastQuery(where.trim() ? `${q} ${where.trim()}` : q);
      } else {
        setSelected((prev) => new Set([...prev, ...found.filter((p) => !p.existing && p.phone).map((p) => p.id)]));
      }
      setNextPageToken(r?.nextPageToken || null);
      if (r?.usage) setUsage(r.usage);
      setSearched(true);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível pesquisar');
    } finally {
      setSearching(false);
    }
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.id));

  const importSelected = async () => {
    const chosen = places.filter((p) => selected.has(p.id) && !p.existing);
    if (!chosen.length) return;
    setImporting(true);
    try {
      const r = await apiRequest('/lead-finder/import', 'POST', { places: chosen, query: lastQuery });
      const imported = Number(r?.imported || 0);
      toast.success(imported === 1 ? '1 lead importado' : `${imported} leads importados`, {
        description: r?.limited ? 'Chegou ao limite de leads do plano' : undefined,
      });
      setPlaces((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, existing: true } : p)));
      setSelected(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível importar');
    } finally {
      setImporting(false);
    }
  };

  if (configured === false) {
    return (
      <div className="space-y-6">
        <PageHeader title="Encontrar leads" icon={Search} />
        <EmptyState icon={MapPin} title="A pesquisa no Google Maps ainda não está ligada" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader title="Encontrar leads" description="Empresas do Google Maps com telefone e site" icon={Search} />

      <form
        onSubmit={(e) => { e.preventDefault(); void search(false); }}
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="min-w-0">
            <Label htmlFor="lf-what" className="mb-1.5 block">O que procura</Label>
            <Input id="lf-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Clínica, restaurante, escola…" maxLength={120} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="lf-where" className="mb-1.5 block">Onde</Label>
            <Input id="lf-where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Maputo" maxLength={120} />
          </div>
          <Button type="submit" disabled={searching || !what.trim() || atLimit || configured === null}>
            {searching ? 'A pesquisar…' : 'Pesquisar'}
          </Button>
        </div>
        {usage && (
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            {atLimit ? `Usou as ${usage.limit} pesquisas deste mês` : `${usage.used} de ${usage.limit} pesquisas este mês`}
          </p>
        )}
      </form>

      {searched && places.length === 0 && !searching && (
        <EmptyState icon={Search} title="Nenhuma empresa encontrada" />
      )}

      {places.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={allSelected}
                disabled={selectable.length === 0}
                onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.id)))}
              />
              <span className="tabular-nums">{places.length} empresas</span>
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">{selected.size} escolhidas</span>
          </div>

          <ul className="divide-y divide-border">
            {places.map((p) => (
              <li key={p.id} className={`flex items-start gap-3 px-4 py-3 ${p.existing ? 'opacity-60' : ''}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 flex-shrink-0 accent-[hsl(var(--primary))]"
                  checked={selected.has(p.id)}
                  disabled={p.existing}
                  onChange={() => toggle(p.id)}
                  aria-label={p.name}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground" translate="no">{p.name}</p>
                    {p.existing && <span className="flex-shrink-0 rounded border border-border px-1.5 text-xs text-muted-foreground">Já é lead</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.category}
                    {p.rating !== null && (
                      <span className="inline-flex items-center gap-0.5 tabular-nums">
                        {p.category ? ' · ' : ''}
                        <Star className="h-3 w-3 fill-current" aria-hidden /> {p.rating.toFixed(1)}
                        {p.reviews ? ` (${p.reviews})` : ''}
                      </span>
                    )}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {p.phone ? (
                      <span className="inline-flex items-center gap-1 text-foreground tabular-nums" translate="no">
                        <Phone className="h-3 w-3 text-muted-foreground" aria-hidden /> {p.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sem telefone</span>
                    )}
                    {p.website && (
                      <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Site <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </div>
                  {p.address && <p className="mt-1 truncate text-xs text-muted-foreground" translate="no">{p.address}</p>}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            {nextPageToken && (
              <Button variant="outline" onClick={() => void search(true)} disabled={searching || atLimit}>
                {searching ? 'A pesquisar…' : 'Mais resultados'}
              </Button>
            )}
            <Button onClick={importSelected} disabled={importing || selected.size === 0}>
              {importing ? 'A importar…' : selected.size === 1 ? 'Importar 1 lead' : `Importar ${selected.size} leads`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Encontrar leads no Google Maps pela API oficial da Google (Places API, "Text Search (New)").
// Devolve empresas com nome, telefone, site, morada, avaliação e categoria. Configuração:
// GOOGLE_PLACES_API_KEY (Google Cloud → APIs e serviços → Places API (New)).
//
// A Google cobra por pesquisa: cada página de resultados conta para o limite mensal do plano.
// Os termos da Google não deixam copiar a base em massa: só se guarda o que a pessoa escolhe importar.
import { query } from '../database/connection';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const TIMEOUT_MS = 15_000;
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount',
  'places.primaryTypeDisplayName', 'places.googleMapsUri', 'places.businessStatus', 'nextPageToken',
].join(',');

/** Pesquisas por mês (cada página de 20 resultados conta uma) */
export const MONTHLY_SEARCHES: Record<string, number> = { free: 10, business: 150, enterprise: 600 };

export interface FoundPlace {
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

export class LeadFinderError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

export const isPlacesConfigured = () => !!process.env.GOOGLE_PLACES_API_KEY;
const digits = (s: string) => String(s || '').replace(/\D/g, '');
const phoneKey = (s: string) => digits(s).slice(-9);

export async function searchesThisMonth(userId: string): Promise<{ used: number; limit: number }> {
  const [u, c] = await Promise.all([
    query('SELECT plan FROM users WHERE id = $1', [userId]),
    query(`SELECT COUNT(*)::int AS n FROM lead_searches WHERE user_id = $1 AND created_at >= date_trunc('month', NOW())`, [userId]),
  ]);
  const plan = String(u.rows[0]?.plan || 'free').toLowerCase();
  return { used: Number(c.rows[0]?.n || 0), limit: MONTHLY_SEARCHES[plan] ?? MONTHLY_SEARCHES.free };
}

/** Pesquisa no Google Maps. Marca as empresas que já são leads desta conta. */
export async function searchPlaces(userId: string, what: string, where: string, pageToken?: string) {
  if (!isPlacesConfigured()) {
    throw new LeadFinderError('A pesquisa no Google Maps ainda não está configurada.', 422, 'places_not_configured');
  }
  const q = what.trim().slice(0, 120);
  const loc = where.trim().slice(0, 120);
  if (!q) throw new LeadFinderError('Escreva o que procura (ex.: clínica, restaurante)');

  const usage = await searchesThisMonth(userId);
  if (usage.used >= usage.limit) {
    throw new LeadFinderError(`Chegou ao limite de ${usage.limit} pesquisas deste mês.`, 403, 'search_limit');
  }

  // Erros da Google vão com 422 e a mensagem dela: um 5xx é trocado pela página do Cloudflare/proxy
  // (sem CORS) e o painel só via "Sem ligação ao servidor", sem saber porquê.
  let res: Response;
  try {
    res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY as string,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: loc ? `${q} em ${loc}` : q,
        languageCode: 'pt',
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: any) {
    console.error('[LeadFinder] Sem ligação à Places API:', err?.message, err?.cause?.code || '');
    throw new LeadFinderError('Não foi possível ligar ao Google. Tente de novo.', 422, 'places_unreachable');
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const googleMessage = String(data?.error?.message || '').slice(0, 300);
    console.error('[LeadFinder] Places API:', res.status, data?.error?.status || '', googleMessage);
    // Faturação desligada, API não ativada, chave restrita… a mensagem da Google diz qual
    throw new LeadFinderError(
      googleMessage ? `O Google recusou a pesquisa: ${googleMessage}` : 'O Google recusou a pesquisa. Tente de novo.',
      422,
      'places_error',
    );
  }

  const places: FoundPlace[] = (data.places || [])
    .filter((p: any) => p.businessStatus !== 'CLOSED_PERMANENTLY')
    .map((p: any) => ({
      id: String(p.id),
      name: String(p.displayName?.text || ''),
      phone: p.internationalPhoneNumber || p.nationalPhoneNumber || null,
      address: p.formattedAddress || null,
      website: p.websiteUri || null,
      rating: typeof p.rating === 'number' ? p.rating : null,
      reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      category: p.primaryTypeDisplayName?.text || null,
      mapsUrl: p.googleMapsUri || null,
    }));

  await query('INSERT INTO lead_searches (user_id, query, location, results) VALUES ($1, $2, $3, $4)', [userId, q, loc || null, places.length]);

  // Já são leads? (pelo lugar do Google ou pelo telefone)
  const keys = places.map((p) => (p.phone ? phoneKey(p.phone) : '')).filter((k) => k.length >= 7);
  const known = await query(
    `SELECT custom_fields->>'google_place_id' AS place_id,
            RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) AS k1,
            RIGHT(regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g'), 9) AS k2
       FROM leads
      WHERE user_id = $1
        AND (custom_fields->>'google_place_id' = ANY($2::text[])
          OR RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = ANY($3::text[])
          OR RIGHT(regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g'), 9) = ANY($3::text[]))`,
    [userId, places.map((p) => p.id), keys],
  );
  const knownIds = new Set(known.rows.map((r: any) => r.place_id).filter(Boolean));
  const knownPhones = new Set(known.rows.flatMap((r: any) => [r.k1, r.k2]).filter(Boolean));
  for (const p of places) {
    p.existing = knownIds.has(p.id) || (!!p.phone && knownPhones.has(phoneKey(p.phone)));
  }

  return {
    places,
    nextPageToken: data.nextPageToken || null,
    usage: { used: usage.used + 1, limit: usage.limit },
  };
}

const slug = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const short = (v: unknown, max: number) => (v === null || v === undefined ? null : String(v).slice(0, max) || null);

/** Importa as empresas escolhidas como leads (sem repetir as que já existem) */
export async function importPlaces(userId: string, raw: unknown[], searchText: string, leadRoom: number) {
  const tag = slug(searchText);
  const tags = ['google-maps', ...(tag ? [tag] : [])];
  let imported = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (const item of Array.isArray(raw) ? raw.slice(0, 100) : []) {
    const p: any = item || {};
    const id = short(p.id, 200);
    const name = short(p.name, 255);
    if (!id || !name || seen.has(id)) { skipped += 1; continue; }
    seen.add(id);
    if (imported >= leadRoom) { skipped += 1; continue; }

    const phone = short(p.phone, 40);
    const key = phone ? phoneKey(phone) : '';
    const dup = await query(
      `SELECT 1 FROM leads WHERE user_id = $1
          AND (custom_fields->>'google_place_id' = $2
            OR ($3 <> '' AND (RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = $3
                           OR RIGHT(regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g'), 9) = $3)))
        LIMIT 1`,
      [userId, id, key],
    );
    if (dup.rows.length) { skipped += 1; continue; }

    const website = short(p.website, 500);
    const address = short(p.address, 500);
    const notes = [address, website].filter(Boolean).join('\n') || null;
    await query(
      `INSERT INTO leads (user_id, name, company, phone, source, status, tags, notes, custom_fields)
       VALUES ($1, $2, $2, $3, 'Google Maps', 'novo', $4, $5, $6)`,
      [userId, name, phone, tags, notes, JSON.stringify({
        google_place_id: id,
        website,
        address,
        category: short(p.category, 120),
        rating: typeof p.rating === 'number' ? p.rating : null,
        reviews: typeof p.reviews === 'number' ? p.reviews : null,
        maps_url: short(p.mapsUrl, 500),
      })],
    );
    imported += 1;
  }
  return { imported, skipped };
}

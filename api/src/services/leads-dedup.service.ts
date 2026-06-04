/**
 * Centralized lead deduplication service.
 *
 * Priority order when searching for an existing lead:
 *   1. Channel-specific ID (facebook_id, instagram_id, telegram_id, whatsapp_lid)
 *   2. Normalized phone number — searched across ALL channel types
 *   3. Email address — searched across ALL channel types
 *   4. Website visitorId (`web_${visitorId}`)
 *
 * When a match is found from a different channel, the new channel's identifier
 * is linked to the existing lead so future messages are correlated correctly.
 */

import { query } from '../database/connection';

export interface LeadLookupInput {
  userId: string;

  // Channel-specific identifiers
  phone?: string;           // normalized (digits only)
  email?: string;
  facebookId?: string;
  instagramId?: string;
  telegramId?: string;
  whatsappLid?: string;
  webVisitorId?: string;    // stored as `web_${visitorId}`

  // Data to set/update on the lead if found or created
  name?: string;
  avatarUrl?: string;
  source?: string;
}

interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
  whatsapp_lid: string | null;
  source: string | null;
  [key: string]: any;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Find an existing lead across ALL channels for a given user.
 * Returns null if no match found.
 */
export async function findExistingLead(userId: string, input: LeadLookupInput): Promise<LeadRow | null> {
  const conditions: string[] = [];
  const values: any[] = [userId];
  let idx = 2;

  // 1. Channel-specific IDs (most reliable)
  if (input.facebookId) {
    conditions.push(`facebook_id = $${idx++}`);
    values.push(input.facebookId);
  }
  if (input.instagramId) {
    conditions.push(`instagram_id = $${idx++}`);
    values.push(input.instagramId);
  }
  if (input.telegramId) {
    conditions.push(`telegram_id = $${idx++}`);
    values.push(input.telegramId);
  }
  if (input.whatsappLid) {
    conditions.push(`whatsapp_lid = $${idx++}`);
    values.push(input.whatsappLid);
  }

  // 2. Normalized phone — cross-channel (digits only comparison)
  if (input.phone && input.phone.length >= 7) {
    const norm = normalizePhone(input.phone);
    if (norm.length >= 7) {
      conditions.push(
        `(REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $${idx} OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') = $${idx})`
      );
      values.push(norm);
      idx++;

      // Last-8-digits fallback (handles country code variations)
      if (norm.length >= 8) {
        const last8 = norm.slice(-8);
        conditions.push(
          `(RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 8) = $${idx} OR RIGHT(REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g'), 8) = $${idx})`
        );
        values.push(last8);
        idx++;
      }
    }
  }

  // 3. Email — cross-channel
  if (input.email) {
    conditions.push(`LOWER(email) = LOWER($${idx++})`);
    values.push(input.email);
  }

  // 4. Website visitorId
  if (input.webVisitorId) {
    conditions.push(`whatsapp = $${idx++}`);
    values.push(input.webVisitorId);
  }

  if (conditions.length === 0) return null;

  const sql = `
    SELECT * FROM leads
    WHERE user_id = $1
      AND (${conditions.join(' OR ')})
    ORDER BY created_at ASC
    LIMIT 1
  `;

  try {
    const result = await query(sql, values);
    return result.rows[0] || null;
  } catch (err: any) {
    console.warn('[LeadsDedup] findExistingLead error:', err.message);
    return null;
  }
}

/**
 * Link new channel identifiers to an existing lead.
 * Only sets fields that are currently empty on the lead.
 */
export async function linkChannelToLead(leadId: string, input: LeadLookupInput): Promise<void> {
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  // Update name if currently generic ("Visitante..." etc.)
  if (input.name) {
    updates.push(`name = CASE WHEN name IS NULL OR name = '' OR name LIKE 'Visitante%' THEN $${idx++} ELSE name END`);
    values.push(input.name);
  }
  if (input.email) {
    updates.push(`email = COALESCE(email, $${idx++})`);
    values.push(input.email);
  }
  if (input.phone) {
    updates.push(`phone = COALESCE(phone, $${idx++})`);
    values.push(input.phone);
  }
  if (input.facebookId) {
    updates.push(`facebook_id = COALESCE(facebook_id, $${idx++})`);
    values.push(input.facebookId);
  }
  if (input.instagramId) {
    updates.push(`instagram_id = COALESCE(instagram_id, $${idx++})`);
    values.push(input.instagramId);
  }
  if (input.telegramId) {
    updates.push(`telegram_id = COALESCE(telegram_id, $${idx++})`);
    values.push(input.telegramId);
  }
  if (input.whatsappLid) {
    updates.push(`whatsapp_lid = COALESCE(whatsapp_lid, $${idx++})`);
    values.push(input.whatsappLid);
  }
  if (input.webVisitorId) {
    // Only set whatsapp field with web_ prefix if it's currently empty or also web_
    updates.push(`whatsapp = CASE WHEN whatsapp IS NULL OR whatsapp LIKE 'web_%' THEN $${idx++} ELSE whatsapp END`);
    values.push(input.webVisitorId);
  }
  if (input.avatarUrl) {
    updates.push(`avatar_url = COALESCE(avatar_url, $${idx++})`);
    values.push(input.avatarUrl);
  }

  if (updates.length === 0) return;

  values.push(leadId);
  const sql = `UPDATE leads SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`;

  try {
    await query(sql, values);
  } catch (err: any) {
    console.warn('[LeadsDedup] linkChannelToLead error:', err.message);
  }
}

/**
 * Main entry point: find existing lead or create a new one.
 * Automatically links channel identifiers if matched from a different channel.
 */
export async function findOrCreateLead(input: LeadLookupInput): Promise<LeadRow> {
  const { userId, name, email, phone, facebookId, instagramId, telegramId,
          whatsappLid, webVisitorId, avatarUrl, source } = input;

  // 1. Search across all channels
  const existing = await findExistingLead(userId, input);

  if (existing) {
    // Link new channel identifiers to the found lead (non-destructive update)
    await linkChannelToLead(existing.id, input);
    console.log(`[LeadsDedup] ✅ Lead existente encontrado: ${existing.id} (${existing.name}) — canal ${existing.source || 'desconhecido'} → ${source || 'novo canal'}`);
    return existing;
  }

  // 2. Create new lead
  const leadName = name || email || phone || `Visitante ${(webVisitorId || '').replace('web_', '').substring(0, 8)}` || 'Anónimo';
  const leadPhone = phone || null;
  const leadWhatsapp = webVisitorId || phone || null;

  const result = await query(
    `INSERT INTO leads
       (user_id, name, email, phone, whatsapp, facebook_id, instagram_id, telegram_id,
        whatsapp_lid, avatar_url, source, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'novo')
     RETURNING *`,
    [userId, leadName, email || null, leadPhone, leadWhatsapp,
     facebookId || null, instagramId || null, telegramId || null,
     whatsappLid || null, avatarUrl || null, source || 'unknown']
  );

  console.log(`[LeadsDedup] ✨ Novo lead criado: ${result.rows[0].id} (${leadName}) — canal ${source}`);
  return result.rows[0];
}

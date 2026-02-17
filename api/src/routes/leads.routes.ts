import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { LeadsService } from '../services/leads.service';
import { notificationsService } from '../services/notifications.service';
import { getStorageService } from '../services/storage.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { ChannelsService } from '../services/channels.service';
import { leadTrackingService } from '../services/lead-tracking.service';
import { query as dbQuery } from '../database/connection';

const router = Router();
const leadsService = new LeadsService();
const whatsappService = new WhatsAppService();
const channelsService = new ChannelsService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authMiddleware);

// ============================================
// STATUS NORMALIZATION
// ============================================

/**
 * POST /api/leads/normalize-statuses
 * Normalize all lead statuses: lowercase, trim, map English→Portuguese
 * This cleans up duplicates like 'New', 'new', 'Novo', 'Novos' → 'novo'
 */
router.post('/normalize-statuses', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Map of known variants to canonical status
    const normalizations = [
      { from: 'new', to: 'novo' },
      { from: 'novos', to: 'novo' },
      { from: 'contacted', to: 'contatado' },
      { from: 'contatados', to: 'contatado' },
      { from: 'qualified', to: 'qualificado' },
      { from: 'qualificados', to: 'qualificado' },
      { from: 'qualificacao', to: 'qualificado' },
      { from: 'negotiation', to: 'negociacao' },
      { from: 'in_negotiation', to: 'negociacao' },
      { from: 'converted', to: 'convertido' },
      { from: 'convertidos', to: 'convertido' },
      { from: 'lost', to: 'perdido' },
      { from: 'perdidos', to: 'perdido' },
      { from: 'rejected', to: 'perdido' },
      { from: 'discarded', to: 'perdido' },
    ];

    let totalUpdated = 0;

    // First: lowercase + trim all statuses
    const trimResult = await dbQuery(
      `UPDATE leads SET status = LOWER(TRIM(status))
       WHERE user_id = $1 AND status IS NOT NULL AND status != LOWER(TRIM(status))`,
      [user.id]
    );
    totalUpdated += trimResult.rowCount || 0;

    // Then: apply normalization map
    for (const { from, to } of normalizations) {
      const r = await dbQuery(
        `UPDATE leads SET status = $1 WHERE user_id = $2 AND LOWER(TRIM(status)) = $3`,
        [to, user.id, from]
      );
      totalUpdated += r.rowCount || 0;
    }

    console.log(`[LeadsAPI] ✅ Normalized ${totalUpdated} lead statuses for user ${user.id}`);
    res.json({ success: true, updated: totalUpdated });
  } catch (error) {
    next(error);
  }
});

// ============================================
// FUNNEL STAGE MANAGEMENT
// ============================================

/**
 * PUT /api/leads/funnel-stage/rename
 * Rename a funnel stage (updates all leads with old status to new status)
 */
router.put('/funnel-stage/rename', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { oldStatus, newStatus } = req.body;
    if (!oldStatus || !newStatus) {
      return res.status(400).json({ error: 'oldStatus and newStatus are required' });
    }

    const result = await dbQuery(
      'UPDATE leads SET status = $1 WHERE user_id = $2 AND LOWER(status) = LOWER($3)',
      [newStatus, user.id, oldStatus]
    );

    console.log(`[LeadsAPI] ✅ Funnel stage renamed: "${oldStatus}" → "${newStatus}" (${result.rowCount} leads updated)`);

    res.json({ success: true, updated: result.rowCount });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/leads/funnel-stage/add-leads
 * Add specific leads to a funnel stage (set their status)
 */
router.put('/funnel-stage/add-leads', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { status, leadIds } = req.body;
    if (!status || !leadIds?.length) {
      return res.status(400).json({ error: 'status and leadIds are required' });
    }

    const result = await dbQuery(
      'UPDATE leads SET status = $1 WHERE user_id = $2 AND id = ANY($3::uuid[])',
      [status, user.id, leadIds]
    );

    console.log(`[LeadsAPI] ✅ ${result.rowCount} leads added to funnel stage "${status}"`);
    res.json({ success: true, updated: result.rowCount });
  } catch (error) {
    next(error);
  }
});

// ============================================
// LEAD TAG MANAGEMENT
// ============================================

/**
 * PUT /api/leads/lead-tag/rename
 * Rename a lead tag across all leads
 */
router.put('/lead-tag/rename', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { oldTag, newTag } = req.body;
    if (!oldTag || !newTag) {
      return res.status(400).json({ error: 'oldTag and newTag are required' });
    }

    const result = await dbQuery(
      `UPDATE leads
       SET tags = array_replace(tags, $1, $2)
       WHERE user_id = $3 AND $1 = ANY(tags)`,
      [oldTag, newTag, user.id]
    );

    console.log(`[LeadsAPI] ✅ Lead tag renamed: "${oldTag}" → "${newTag}" (${result.rowCount} leads updated)`);
    res.json({ success: true, updated: result.rowCount });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/leads/lead-tag/:tagName
 * Remove a lead tag from all leads (without affecting the leads themselves)
 */
router.delete('/lead-tag/:tagName', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const tagName = decodeURIComponent(req.params.tagName);

    const result = await dbQuery(
      `UPDATE leads
       SET tags = array_remove(tags, $1)
       WHERE user_id = $2 AND $1 = ANY(tags)`,
      [tagName, user.id]
    );

    console.log(`[LeadsAPI] ✅ Lead tag "${tagName}" removed from ${result.rowCount} leads`);
    res.json({ success: true, updated: result.rowCount });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/leads/lead-tag/add-leads
 * Add a lead tag to specific leads
 */
router.put('/lead-tag/add-leads', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { tag, leadIds } = req.body;
    if (!tag || !leadIds?.length) {
      return res.status(400).json({ error: 'tag and leadIds are required' });
    }

    const result = await dbQuery(
      `UPDATE leads
       SET tags = CASE
         WHEN tags IS NULL THEN ARRAY[$1]
         WHEN NOT ($1 = ANY(tags)) THEN array_append(tags, $1)
         ELSE tags
       END
       WHERE user_id = $2 AND id = ANY($3::uuid[])`,
      [tag, user.id, leadIds]
    );

    console.log(`[LeadsAPI] ✅ Tag "${tag}" added to ${result.rowCount} leads`);
    res.json({ success: true, updated: result.rowCount });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SEARCH LEADS (for add-leads modal)
// ============================================

/**
 * GET /api/leads/search-simple?q=text&limit=20
 * Simple lead search for the add-leads modal
 */
router.get('/search-simple', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const search = (req.query.q as string) || '';
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const result = await dbQuery(
      `SELECT id, name, email, phone, status, tags
       FROM leads
       WHERE user_id = $1
       AND (
         name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2
         OR COALESCE(name,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(phone,'') ILIKE $2
       )
       ORDER BY name ASC
       LIMIT $3`,
      [user.id, `%${search}%`, limit]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// ============================================
// STANDARD CRUD ROUTES
// ============================================

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const leads = await leadsService.findAll(user.id, {
      status: req.query.status,
      search: req.query.search,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });

    res.json(leads);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const lead = await leadsService.findById(req.params.id, user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const lead = await leadsService.create(req.body, user.id);

    // Create notification for new lead
    const leadName = lead.name || lead.email || 'Sem nome';
    await notificationsService.createNotification(
      user.id,
      'lead_created',
      'Novo Lead',
      `${leadName} foi adicionado(a) como novo lead`,
      'user-plus',
      { leadId: lead.id, leadName, email: lead.email }
    );

    res.status(201).json(lead);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get old lead data before update to detect status change
    const oldLead = await leadsService.findById(req.params.id, user.id);
    if (!oldLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = await leadsService.update(req.params.id, req.body, user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Create notification if status changed
    if (req.body.status && oldLead.status !== req.body.status) {
      const leadName = lead.name || lead.email || 'Sem nome';
      const newStatusLabel = req.body.status.charAt(0).toUpperCase() + req.body.status.slice(1);
      await notificationsService.createNotification(
        user.id,
        'lead_status_changed',
        'Lead Movido',
        `${leadName} foi movido(a) para ${newStatusLabel}`,
        'arrow-right',
        { leadId: lead.id, leadName, email: lead.email, oldStatus: oldLead.status, newStatus: req.body.status }
      );

      // 📊 Registrar mudança de status no tracking
      try {
        await leadTrackingService.recordStatusChange(
          user.id,
          req.params.id,
          req.body.status,
          req.body.statusChangeReason || 'Manual update via API',
          {
            updated_fields: Object.keys(req.body).filter(k => k !== 'status'),
            source: 'api',
            timestamp: new Date().toISOString()
          }
        );
        console.log('[LeadsAPI] ✅ Status change recorded for lead:', req.params.id);
      } catch (trackErr) {
        console.error('[LeadsAPI] ⚠️ Error recording status change:', trackErr);
      }
    }

    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await leadsService.delete(req.params.id, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/import-bulk', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];

    if (leads.length === 0) {
      return res.status(400).json({ error: 'Leads payload cannot be empty' });
    }

    // Get user plan and limits from database
    const { query } = require('../database/connection');
    const userResult = await query(
      'SELECT plan, plan_limits FROM users WHERE id = $1',
      [user.id]
    );

    const userPlan = userResult.rows[0]?.plan || 'free';
    const planLimits = userResult.rows[0]?.plan_limits || {};

    // Define default import limits per plan
    const importLimits: Record<string, number> = {
      free: planLimits.importBatch || 50,
      business: planLimits.importBatch || 250,
      enterprise: -1, // Unlimited
    };

    const maxImport = importLimits[userPlan] || importLimits.free;

    // Apply import limit if not unlimited
    let leadsToImport = leads;
    let limitApplied = false;

    if (maxImport !== -1 && leads.length > maxImport) {
      leadsToImport = leads.slice(0, maxImport);
      limitApplied = true;
      console.log(`[ImportBulk] Import limit applied: ${leads.length} -> ${maxImport} leads for plan ${userPlan}`);
    }

    const source = typeof req.body?.source === 'string' ? req.body.source : undefined;
    const result = await leadsService.importBulk(leadsToImport, user.id, { source });

    // Build response with limit info if applied
    const response = {
      ...result,
      ...(limitApplied && {
        limitApplied: true,
        limitValue: maxImport,
        totalRequested: leads.length,
      }),
    };

    // Create notification for bulk import
    if (result.imported > 0) {
      const count = result.imported;
      const sourceLabel = source ? ` de ${source}` : '';
      await notificationsService.createNotification(
        user.id,
        'leads_imported',
        'Leads Importados',
        `${count} lead(s) foram importados${sourceLabel} com sucesso`,
        'upload',
        { count, source, totalProcessed: result.total, skipped: result.skipped, duplicatesSkipped: result.duplicatesSkipped }
      );
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.post('/remove-duplicates', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await leadsService.removeDuplicates(user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * ============================================
 * ✅ IMPORTAR LEADS COM VALIDAÇÃO DE WHATSAPP
 * ============================================
 *
 * Importa leads e valida quais números têm WhatsApp ANTES de adicionar ao sistema.
 * Isso evita que números inválidos entrem no funil e travem automações.
 *
 * POST /api/leads/import-with-validation
 * Body: {
 *   leads: [{ name, phone/telefone, email?, ... }],
 *   source?: string,
 *   validateWhatsApp?: boolean (default: true),
 *   skipInvalid?: boolean (default: false - adiciona todos mas marca inválidos)
 * }
 *
 * Response: {
 *   imported: number,
 *   skipped: number,
 *   validWhatsApp: number,
 *   invalidWhatsApp: number,
 *   invalidLeads: [{ name, phone, reason }]
 * }
 */
router.post('/import-with-validation', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      leads,
      source,
      validateWhatsApp = true,
      skipInvalid = false,
      instanceId: requestedInstanceId
    } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'leads array is required' });
    }

    // Limit
    if (leads.length > 500) {
      return res.status(400).json({
        error: 'Maximum 500 leads per request with validation',
        received: leads.length
      });
    }

    console.log(`[Leads Import] Starting import with validation: ${leads.length} leads, validateWhatsApp=${validateWhatsApp}, skipInvalid=${skipInvalid}`);

    // If not validating, just do regular import
    if (!validateWhatsApp) {
      const result = await leadsService.importBulk(leads, user.id, { source });
      return res.json({
        ...result,
        validWhatsApp: 0,
        invalidWhatsApp: 0,
        validationSkipped: true,
      });
    }

    // Get WhatsApp instance
    let instanceId = requestedInstanceId;
    if (!instanceId) {
      const channels = await channelsService.findByType('whatsapp', user.id);
      const activeChannel = channels.find(c => c.status === 'active');
      if (activeChannel?.credentials?.instance_id) {
        instanceId = activeChannel.credentials.instance_id;
      }
    }

    if (!instanceId) {
      // No WhatsApp connected - import without validation
      console.log('[Leads Import] No WhatsApp instance found, importing without validation');
      const result = await leadsService.importBulk(leads, user.id, { source });
      return res.json({
        ...result,
        validWhatsApp: 0,
        invalidWhatsApp: 0,
        validationSkipped: true,
        warning: 'No active WhatsApp instance found. Leads imported without WhatsApp validation.',
      });
    }

    // Extract phone numbers from leads
    const leadsWithPhones = leads.map((lead, index) => {
      const phone = lead.telefone || lead.phone || lead.whatsapp || lead.numero;
      return {
        index,
        lead,
        phone: phone ? String(phone).replace(/\D/g, '') : null,
      };
    });

    // Get only leads with phone numbers
    const phonesToValidate = leadsWithPhones
      .filter(l => l.phone && l.phone.length >= 10)
      .map(l => l.phone!);

    console.log(`[Leads Import] Validating ${phonesToValidate.length} phone numbers on WhatsApp`);

    // Validate numbers on WhatsApp
    let validationResult: { valid: string[]; invalid: string[]; results: any[] } = {
      valid: [],
      invalid: [],
      results: [],
    };

    if (phonesToValidate.length > 0) {
      try {
        validationResult = await whatsappService.checkWhatsAppNumbers(instanceId, phonesToValidate);
      } catch (e: any) {
        console.warn('[Leads Import] WhatsApp validation failed:', e.message);
        // Continue without validation
      }
    }

    // Create sets for quick lookup
    const validPhones = new Set(validationResult.valid.map(p => p.replace(/\D/g, '')));
    const invalidPhones = new Set(validationResult.invalid.map(p => p.replace(/\D/g, '')));

    // Separate valid and invalid leads
    const validLeads: any[] = [];
    const invalidLeadsList: Array<{ name: string; phone: string; reason: string }> = [];

    for (const item of leadsWithPhones) {
      const name = item.lead.name || item.lead.nome || 'Unknown';

      if (!item.phone || item.phone.length < 10) {
        if (!skipInvalid) {
          // Add anyway but mark as no phone
          validLeads.push({
            ...item.lead,
            whatsapp_validated: false,
            whatsapp_validation_reason: 'no_phone',
          });
        } else {
          invalidLeadsList.push({
            name,
            phone: item.phone || '',
            reason: 'No valid phone number',
          });
        }
        continue;
      }

      // Check if phone is valid on WhatsApp
      if (invalidPhones.has(item.phone)) {
        if (!skipInvalid) {
          // Add anyway but mark as invalid WhatsApp
          validLeads.push({
            ...item.lead,
            whatsapp_validated: false,
            whatsapp_validation_reason: 'not_on_whatsapp',
          });
        } else {
          invalidLeadsList.push({
            name,
            phone: item.phone,
            reason: 'Number not registered on WhatsApp',
          });
        }
      } else {
        // Valid or not checked (assume valid)
        validLeads.push({
          ...item.lead,
          whatsapp_validated: validPhones.has(item.phone),
          whatsapp_validation_reason: validPhones.has(item.phone) ? 'valid' : 'not_checked',
        });
      }
    }

    console.log(`[Leads Import] After validation: ${validLeads.length} to import, ${invalidLeadsList.length} invalid`);

    // Import valid leads
    let importResult = { imported: 0, duplicatesSkipped: 0, skipped: 0, total: 0 };
    if (validLeads.length > 0) {
      importResult = await leadsService.importBulk(validLeads, user.id, { source });
    }

    // Create notification
    if (importResult.imported > 0) {
      await notificationsService.createNotification(
        user.id,
        'leads_imported',
        'Leads Importados com Validação',
        `${importResult.imported} lead(s) importados. ${invalidLeadsList.length} número(s) sem WhatsApp ${skipInvalid ? 'ignorados' : 'marcados'}.`,
        'upload',
        {
          imported: importResult.imported,
          validWhatsApp: validationResult.valid.length,
          invalidWhatsApp: invalidLeadsList.length,
        }
      );
    }

    res.json({
      imported: importResult.imported,
      duplicatesSkipped: importResult.duplicatesSkipped,
      skipped: importResult.skipped + invalidLeadsList.length,
      total: leads.length,
      validWhatsApp: validationResult.valid.length,
      invalidWhatsApp: invalidLeadsList.length,
      invalidLeads: invalidLeadsList.length > 0 ? invalidLeadsList : undefined,
      skipInvalidApplied: skipInvalid,
    });
  } catch (error) {
    console.error('[Leads Import] Error:', error);
    next(error);
  }
});

router.post('/:id/avatar', upload.single('avatar'), async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if lead exists
    const lead = await leadsService.findById(req.params.id, user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Upload to MinIO (or fallback)
    const storageService = getStorageService();
    const avatarUrl = await storageService.uploadFile(req.file, 'avatars', user.id);

    // Update lead record
    const updatedLead = await leadsService.updateAvatarUrl(lead.id, avatarUrl, user.id);

    res.json({
      success: true,
      avatarUrl,
      lead: updatedLead
    });
  } catch (error) {
    next(error);
  }
});

export default router;

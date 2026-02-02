import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { LeadsService } from '../services/leads.service';
import { notificationsService } from '../services/notifications.service';
import { getStorageService } from '../services/storage.service';

const router = Router();
const leadsService = new LeadsService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authMiddleware);

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

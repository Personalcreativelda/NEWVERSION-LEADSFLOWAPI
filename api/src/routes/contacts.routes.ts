import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { ContactsService } from '../services/contacts.service';

const router = Router();
const contactsService = new ContactsService();

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const contacts = await contactsService.findAll(user.id, {
      lead_id: req.query.lead_id,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });

    res.json(contacts);
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

    const contact = await contactsService.findById(req.params.id, user.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(contact);
  } catch (error) {
    next(error);
  }
});

// Create or find contact by phone - DEVE VIR ANTES DE /:id
router.post('/create-or-find', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phone, name, channelType } = req.body;
    const { query: dbQuery } = require('../database/connection');

    console.log('[Contacts] create-or-find request - phone:', phone, 'name:', name, 'channelType:', channelType, 'userId:', user.id);
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Try to find existing contact by phone
    const existingContact = await contactsService.findByPhone(phone, user.id);
    
    if (existingContact) {
      console.log('[Contacts] Found existing contact:', existingContact.id);
      return res.json(existingContact);
    }

    // Check if lead with this phone exists
    let leadId = null;
    try {
      const leadResult = await dbQuery(
        'SELECT id FROM leads WHERE (phone = $1 OR whatsapp = $1) AND user_id = $2 LIMIT 1',
        [phone, user.id]
      );
      if (leadResult.rows.length > 0) {
        leadId = leadResult.rows[0].id;
      }
    } catch (err) {
      console.error('Error checking for existing lead:', err);
    }

    // If no lead exists, create one
    if (!leadId) {
      try {
        const leadName = name && name.trim() ? name.trim() : `Contato ${phone}`;
        const newLeadResult = await dbQuery(
          `INSERT INTO leads (user_id, name, phone, whatsapp, status, source)
           VALUES ($1, $2, $3, $3, $4, $5)
           RETURNING id`,
          [user.id, leadName, phone, 'new', channelType || 'whatsapp']
        );
        leadId = newLeadResult.rows[0].id;
      } catch (err) {
        console.error('Error creating lead:', err);
        throw new Error('Erro ao criar lead para o contato');
      }
    }

    // Create new contact
    const contactName = name && name.trim() ? name.trim() : `Contato ${phone}`;
    const newContact = await contactsService.create({
      lead_id: leadId,
      phone,
      whatsapp: phone,
      name: contactName,
    }, user.id);

    console.log('[Contacts] Created new contact object:', newContact);
    console.log('[Contacts] Contact ID:', newContact?.id);
    res.status(201).json(newContact);
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

    const contact = await contactsService.create(req.body, user.id);
    res.status(201).json(contact);
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

    const contact = await contactsService.update(req.params.id, req.body, user.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(contact);
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

    const deleted = await contactsService.delete(req.params.id, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;

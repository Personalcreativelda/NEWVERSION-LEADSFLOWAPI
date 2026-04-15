import { Router } from 'express';
import { query } from '../database/connection';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import twilio from 'twilio';

const router = Router();

// Ensure sms_campaigns table exists
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS sms_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      campaign_name VARCHAR(255) NOT NULL,
      channel_id UUID NOT NULL,
      message TEXT NOT NULL,
      recipient_mode VARCHAR(50) NOT NULL DEFAULT 'all',
      selected_statuses JSONB DEFAULT '[]',
      custom_phones TEXT,
      recipient_count INTEGER DEFAULT 0,
      schedule_mode VARCHAR(20) DEFAULT 'now',
      scheduled_date DATE,
      scheduled_time TIME,
      scheduled_datetime TIMESTAMPTZ,
      status VARCHAR(50) DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0,
      delivered_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, []);
}

ensureTable().catch(err => console.error('[SMSCampaigns] Failed to ensure table:', err));

// GET all SMS campaigns
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const result = await query(
      `SELECT * FROM sms_campaigns WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ success: true, campaigns: result.rows });
  } catch (error) {
    console.error('[SMSCampaigns] Error fetching campaigns:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
  }
});

// GET single SMS campaign
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const result = await query(
      `SELECT * FROM sms_campaigns WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    console.error('[SMSCampaigns] Error fetching campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
  }
});

// POST create SMS campaign
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const {
      campaign_name,
      channel_id,
      message,
      recipient_mode,
      selected_statuses,
      custom_phones,
      recipient_count,
      schedule_mode,
      scheduled_date,
      scheduled_time,
    } = req.body;

    if (!campaign_name || !channel_id || !message || !recipient_mode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: campaign_name, channel_id, message, recipient_mode'
      });
    }

    const normalizedDate = scheduled_date && scheduled_date.trim() !== '' ? scheduled_date : null;
    const normalizedTime = scheduled_time && scheduled_time.trim() !== '' ? scheduled_time : null;
    let scheduled_datetime = null;
    if (schedule_mode === 'scheduled' && normalizedDate && normalizedTime) {
      scheduled_datetime = new Date(`${normalizedDate}T${normalizedTime}`);
    }

    const initialStatus = schedule_mode === 'scheduled' ? 'scheduled' : 'draft';

    const result = await query(
      `INSERT INTO sms_campaigns (
        user_id, campaign_name, channel_id, message, recipient_mode,
        selected_statuses, custom_phones, recipient_count, schedule_mode,
        scheduled_date, scheduled_time, scheduled_datetime, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        userId, campaign_name, channel_id, message, recipient_mode,
        JSON.stringify(selected_statuses || []), custom_phones || null,
        recipient_count || 0, schedule_mode || 'now',
        normalizedDate, normalizedTime, scheduled_datetime, initialStatus
      ]
    );
    res.json({ success: true, campaign: result.rows[0] });
  } catch (error: any) {
    console.error('[SMSCampaigns] Error creating campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to create campaign', details: error.message });
  }
});

// PUT update SMS campaign
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const body = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const updatable = [
      'campaign_name', 'channel_id', 'message', 'recipient_mode',
      'selected_statuses', 'custom_phones', 'recipient_count', 'schedule_mode',
      'scheduled_date', 'scheduled_time', 'scheduled_datetime', 'status',
      'sent_count', 'delivered_count', 'failed_count'
    ];

    if ('scheduled_date' in body) {
      body.scheduled_date = body.scheduled_date?.trim() || null;
    }
    if ('scheduled_time' in body) {
      body.scheduled_time = body.scheduled_time?.trim() || null;
    }
    if (body.schedule_mode === 'scheduled' && body.scheduled_date && body.scheduled_time) {
      body.scheduled_datetime = new Date(`${body.scheduled_date}T${body.scheduled_time}`);
    } else if (body.schedule_mode === 'now') {
      body.scheduled_datetime = null;
    }

    updatable.forEach(key => {
      if (key in body) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(key === 'selected_statuses' ? JSON.stringify(body[key]) : body[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    values.push(id, userId);
    const result = await query(
      `UPDATE sms_campaigns SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, campaign: result.rows[0] });
  } catch (error: any) {
    console.error('[SMSCampaigns] Error updating campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to update campaign' });
  }
});

// DELETE SMS campaign
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const result = await query(
      `DELETE FROM sms_campaigns WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    console.error('[SMSCampaigns] Error deleting campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to delete campaign' });
  }
});

// POST /:id/send — trigger bulk SMS send via Twilio
router.post('/:id/send', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    // 1. Get campaign
    const campaignResult = await query(
      'SELECT * FROM sms_campaigns WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    const campaign = campaignResult.rows[0];

    // 2. Get Twilio channel credentials
    const channelResult = await query(
      `SELECT * FROM channels WHERE id = $1 AND user_id = $2 AND type = 'twilio_sms'`,
      [campaign.channel_id, userId]
    );
    if (channelResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Twilio SMS channel not found' });
    }
    const channel = channelResult.rows[0];
    const creds = typeof channel.credentials === 'string'
      ? JSON.parse(channel.credentials)
      : channel.credentials;

    if (!creds?.accountSid || !creds?.authToken || !creds?.phoneNumber) {
      return res.status(400).json({ success: false, error: 'Twilio credentials incomplete' });
    }

    // 3. Build recipient list
    let recipients: { phone: string; name: string }[] = [];
    const statuses: string[] = typeof campaign.selected_statuses === 'string'
      ? JSON.parse(campaign.selected_statuses)
      : campaign.selected_statuses || [];

    if (campaign.recipient_mode === 'all') {
      const rows = await query(
        `SELECT telefone as phone, nome as name FROM leads
         WHERE user_id = $1 AND telefone IS NOT NULL AND telefone != ''`,
        [userId]
      );
      recipients = rows.rows;
    } else if (campaign.recipient_mode === 'segments') {
      const rows = await query(
        `SELECT telefone as phone, nome as name FROM leads
         WHERE user_id = $1 AND status = ANY($2) AND telefone IS NOT NULL AND telefone != ''`,
        [userId, statuses]
      );
      recipients = rows.rows;
    } else if (campaign.recipient_mode === 'custom') {
      recipients = (campaign.custom_phones || '')
        .split(',')
        .map((p: string) => ({ phone: p.trim(), name: p.trim() }))
        .filter((p: { phone: string }) => p.phone.length > 6);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients with phone numbers found' });
    }

    // 4. Mark as active and respond immediately
    await query(
      `UPDATE sms_campaigns SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: `Sending SMS to ${recipients.length} recipients`,
      recipientCount: recipients.length
    });

    // 5. Send in background (fire-and-forget after response)
    setImmediate(async () => {
      const twilioClient = twilio(creds.accountSid, creds.authToken);
      let sentCount = 0;
      let failedCount = 0;

      for (const recipient of recipients) {
        try {
          const body = campaign.message
            .replace(/\{\{nome\}\}/gi, recipient.name || '')
            .replace(/\{\{telefone\}\}/gi, recipient.phone || '');

          await twilioClient.messages.create({
            body,
            from: creds.phoneNumber,
            to: recipient.phone,
          });
          sentCount++;
        } catch (err) {
          console.error(`[SMSCampaigns] Failed to send to ${recipient.phone}:`, err);
          failedCount++;
        }
        // ~20 msg/s to stay within Twilio default rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      await query(
        `UPDATE sms_campaigns SET
          status = 'completed',
          sent_count = $1,
          failed_count = $2,
          sent_at = NOW(),
          updated_at = NOW()
         WHERE id = $3`,
        [sentCount, failedCount, id]
      );
      console.log(`[SMSCampaigns] Campaign ${id} completed: ${sentCount} sent, ${failedCount} failed`);
    });

  } catch (error: any) {
    console.error('[SMSCampaigns] Error sending campaign:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Failed to send campaign' });
    }
  }
});

export default router;

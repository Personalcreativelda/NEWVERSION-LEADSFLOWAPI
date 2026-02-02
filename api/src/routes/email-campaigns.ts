import { Router } from 'express';
import multer from 'multer';
import { query } from '../database/connection';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { emailService } from '../services/email.service';
import { getStorageService } from '../services/storage.service';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Upload attachment to MinIO/Storage
router.post('/upload-attachment', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const storage = getStorageService();
        const userId = req.user?.id;
        const url = await storage.uploadFile(req.file, 'email-attachments', userId);

        res.json({
            success: true,
            url,
            name: req.file.originalname,
            type: req.file.mimetype,
            size: req.file.size
        });
    } catch (error: any) {
        console.error('[EmailCampaigns] Attachment upload failed:', error);
        res.status(500).json({ success: false, error: 'Failed to upload attachment' });
    }
});

// Debug endpoint to check lead columns
router.get('/debug-leads', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        const columnsResult = await query(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'leads'",
            []
        );
        const leadsCount = await query(
            "SELECT count(*) FROM leads WHERE user_id = $1",
            [userId]
        );
        const leadsWithEmail = await query(
            "SELECT count(*) FROM leads WHERE user_id = $1 AND email IS NOT NULL AND email != ''",
            [userId]
        );

        res.json({
            columns: columnsResult.rows.map(r => r.column_name),
            totalLeads: leadsCount.rows[0].count,
            leadsWithEmail: leadsWithEmail.rows[0].count,
            userId
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get all email campaigns for user
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;

        const result = await query(
            `SELECT * FROM email_campaigns 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
            [userId]
        );

        res.json({ success: true, campaigns: result.rows });
    } catch (error) {
        console.error('Error fetching email campaigns:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
    }
});

// Get single email campaign
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const result = await query(
            `SELECT * FROM email_campaigns 
       WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        res.json({ success: true, campaign: result.rows[0] });
    } catch (error) {
        console.error('Error fetching email campaign:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
    }
});

// Create new email campaign
router.post('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        const {
            campaign_name,
            subject,
            from_email,
            from_name,
            message,
            html_content,
            is_html,
            recipient_mode,
            selected_statuses,
            custom_emails,
            recipient_count,
            schedule_mode,
            scheduled_date,
            scheduled_time,
            attachments,
            metadata
        } = req.body;

        // Validate required fields
        if (!campaign_name || !subject || !from_email || !recipient_mode) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: campaign_name, subject, from_email, recipient_mode'
            });
        }

        // Calculate scheduled_datetime if scheduled
        let scheduled_datetime = null;
        const normalizedDate = scheduled_date && scheduled_date.trim() !== '' ? scheduled_date : null;
        const normalizedTime = scheduled_time && scheduled_time.trim() !== '' ? scheduled_time : null;

        if (schedule_mode === 'scheduled' && normalizedDate && normalizedTime) {
            scheduled_datetime = new Date(`${normalizedDate}T${normalizedTime}`);
        }

        const result = await query(
            `INSERT INTO email_campaigns (
        user_id, campaign_name, subject, from_email, from_name,
        message, html_content, is_html, recipient_mode, selected_statuses,
        custom_emails, recipient_count, schedule_mode, scheduled_date,
        scheduled_time, scheduled_datetime, attachments, metadata, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
            [
                userId, campaign_name, subject, from_email, from_name,
                message, html_content, is_html, recipient_mode, selected_statuses,
                custom_emails, recipient_count, schedule_mode, normalizedDate,
                normalizedTime, scheduled_datetime,
                JSON.stringify(attachments || []),
                JSON.stringify(metadata || {}),
                schedule_mode === 'scheduled' ? 'scheduled' : 'draft'
            ]
        );

        res.json({ success: true, campaign: result.rows[0] });
    } catch (error: any) {
        console.error('SERVER ERROR - Error creating email campaign:', {
            message: error.message,
            stack: error.stack,
            detail: error.detail,
            code: error.code,
            table: error.table,
            column: error.column
        });
        res.status(500).json({
            success: false,
            error: 'Failed to create campaign',
            details: error.message
        });
    }
});

// Update email campaign
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const body = req.body;

        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        // Fields to potentially update
        const updateableFields = [
            'campaign_name', 'subject', 'from_email', 'from_name', 'message',
            'html_content', 'is_html', 'recipient_mode', 'selected_statuses',
            'custom_emails', 'recipient_count', 'schedule_mode', 'scheduled_date',
            'scheduled_time', 'scheduled_datetime', 'attachments', 'metadata', 'status'
        ];

        // Normalize empty strings to null for date/time fields if they exist in body
        if (body.hasOwnProperty('scheduled_date')) {
            body.scheduled_date = body.scheduled_date && body.scheduled_date.trim() !== '' ? body.scheduled_date : null;
        }
        if (body.hasOwnProperty('scheduled_time')) {
            body.scheduled_time = body.scheduled_time && body.scheduled_time.trim() !== '' ? body.scheduled_time : null;
        }

        // Calculate scheduled_datetime if relevant fields are provided
        if (body.schedule_mode === 'scheduled' && body.scheduled_date && body.scheduled_time) {
            body.scheduled_datetime = new Date(`${body.scheduled_date}T${body.scheduled_time}`);
        } else if (body.schedule_mode === 'now') {
            body.scheduled_datetime = null;
        }

        updateableFields.forEach(key => {
            if (body.hasOwnProperty(key)) {
                fields.push(`${key} = $${paramIndex}`);

                let value = body[key];
                if (key === 'attachments' || key === 'metadata') {
                    value = JSON.stringify(value);
                }

                values.push(value);
                paramIndex++;
            }
        });

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        // Add ID and UserId to values
        values.push(id);
        values.push(userId);
        const idParamIndex = paramIndex;
        const userIdParamIndex = paramIndex + 1;

        const result = await query(
            `UPDATE email_campaigns SET
        ${fields.join(', ')},
        updated_at = NOW()
      WHERE id = $${idParamIndex} AND user_id = $${userIdParamIndex}
      RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        res.json({ success: true, campaign: result.rows[0] });
    } catch (error: any) {
        console.error('SERVER ERROR - Error updating email campaign:', {
            message: error.message,
            stack: error.stack,
            detail: error.detail,
            code: error.code,
            table: error.table,
            column: error.column,
            campaign_id: req.params.id
        });
        res.status(500).json({
            success: false,
            error: 'Failed to update campaign',
            details: error.message
        });
    }
});

// Delete email campaign
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const result = await query(
            `DELETE FROM email_campaigns 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        res.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (error) {
        console.error('Error deleting email campaign:', error);
        res.status(500).json({ success: false, error: 'Failed to delete campaign' });
    }
});

// Update campaign stats after sending
router.patch('/:id/stats', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { sent_count, delivered_count, opened_count, clicked_count, failed_count, status } = req.body;

        const result = await query(
            `UPDATE email_campaigns SET
        sent_count = COALESCE($1, sent_count),
        delivered_count = COALESCE($2, delivered_count),
        opened_count = COALESCE($3, opened_count),
        clicked_count = COALESCE($4, clicked_count),
        failed_count = COALESCE($5, failed_count),
        status = COALESCE($6, status),
        sent_at = CASE WHEN $6 = 'sent' THEN NOW() ELSE sent_at END,
        updated_at = NOW()
      WHERE id = $7 AND user_id = $8
      RETURNING *`,
            [sent_count, delivered_count, opened_count, clicked_count, failed_count, status, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        res.json({ success: true, campaign: result.rows[0] });
    } catch (error) {
        console.error('Error updating campaign stats:', error);
        res.status(500).json({ success: false, error: 'Failed to update stats' });
    }
});

// Test email send with dynamic settings
router.post('/test', requireAuth, async (req, res) => {
    try {
        const { smtp_settings, subject, message, is_html, recipient_email, attachments } = req.body;

        if (!smtp_settings || !recipient_email || !subject) {
            return res.status(400).json({ success: false, error: 'Missing required test fields' });
        }

        await emailService.sendCampaignEmail(
            recipient_email,
            `[TESTE] ${subject}`,
            message,
            is_html,
            smtp_settings,
            attachments
        );

        res.json({ success: true, message: 'Test email sent successfully' });
    } catch (error: any) {
        console.error('Error sending test email:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to send test email' });
    }
});

// Trigger direct send for a campaign
router.post('/:id/send', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { smtp_settings } = req.body;

        if (!smtp_settings) {
            return res.status(400).json({ success: false, error: 'SMTP settings are required for direct sending' });
        }

        // 1. Get campaign
        const campaignResult = await query(
            'SELECT * FROM email_campaigns WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (campaignResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        const campaign = campaignResult.rows[0];

        // 2. Identify recipients
        let recipients: { email: string; name: string }[] = [];

        if (campaign.recipient_mode === 'all') {
            const leadsResult = await query(
                'SELECT email, nome as name FROM leads WHERE user_id = $1 AND email IS NOT NULL AND email != \'\'',
                [userId]
            );
            recipients = leadsResult.rows;
        } else if (campaign.recipient_mode === 'segments') {
            const leadsResult = await query(
                'SELECT email, nome as name FROM leads WHERE user_id = $1 AND status = ANY($2) AND email IS NOT NULL AND email != \'\'',
                [userId, campaign.selected_statuses]
            );
            recipients = leadsResult.rows;
        } else if (campaign.recipient_mode === 'custom') {
            recipients = (campaign.custom_emails || '')
                .split(',')
                .map((e: string) => ({ email: e.trim(), name: e.trim() }))
                .filter((e: any) => e.email.includes('@'));
        }

        console.log(`[Campaign ${id}] Found ${recipients.length} recipients for mode ${campaign.recipient_mode}`);

        if (recipients.length === 0) {
            return res.status(400).json({ success: false, error: 'No recipients found for this campaign' });
        }

        // 3. Update status to active
        await query(
            'UPDATE email_campaigns SET status = \'active\', updated_at = NOW() WHERE id = $1',
            [id]
        );

        // 4. Send emails asynchronously (don't block the response)
        (async () => {
            try {
                console.log(`[Campaign ${id}] Starting background send loop for ${recipients.length} recipients`);
                let sent = 0;
                let failed = 0;
                const failureLogs: any[] = [];

                for (const recipient of recipients) {
                    try {
                        console.log(`[Campaign ${id}] Sending to ${recipient.email}...`);
                        // Substituir variáveis básicas
                        const personalizedMessage = campaign.is_html
                            ? (campaign.html_content || '').replace(/{{name}}/g, recipient.name).replace(/{{nome}}/g, recipient.name)
                            : (campaign.message || '').replace(/{{name}}/g, recipient.name).replace(/{{nome}}/g, recipient.name);

                        await emailService.sendCampaignEmail(
                            recipient.email,
                            campaign.subject,
                            personalizedMessage,
                            campaign.is_html,
                            smtp_settings,
                            campaign.attachments
                        );
                        sent++;
                    } catch (err: any) {
                        console.error(`[Campaign Send] Failed to send to ${recipient.email}:`, err);
                        failed++;
                        failureLogs.push({
                            email: recipient.email,
                            name: recipient.name,
                            error: err.message || 'Erro desconhecido',
                            timestamp: new Date().toISOString()
                        });
                    }

                    // Update database frequently to show progress on dashboard
                    await query(
                        'UPDATE email_campaigns SET sent_count = $1, failed_count = $2, delivered_count = $1, metadata = metadata || $3, updated_at = NOW() WHERE id = $4',
                        [sent, failed, JSON.stringify({ failures: failureLogs }), id]
                    );

                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1s for safety
                }

                // Update stats when finished - use 'completed' for CampaignsPage compatibility
                await query(
                    `UPDATE email_campaigns SET 
              status = 'completed', 
              sent_count = $1, 
              failed_count = $2, 
              delivered_count = $1,
              sent_at = NOW(), 
              updated_at = NOW() 
            WHERE id = $3`,
                    [sent, failed, id]
                );
                console.log(`[Campaign Send] ✅ Campaign ${id} completed. Sent: ${sent}, Failed: ${failed}`);
            } catch (fatalError: any) {
                console.error(`[Campaign ${id}] ❌ FATAL ERROR IN SEND LOOP:`, fatalError);
                await query(
                    'UPDATE email_campaigns SET status = $1, metadata = metadata || $2 WHERE id = $3',
                    ['failed', JSON.stringify({ last_error: fatalError.message }), id]
                );
            }
        })();

        res.json({
            success: true,
            message: 'Campaign sending started in background',
            recipientCount: recipients.length
        });

    } catch (error: any) {
        console.error('Error triggering campaign send:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to trigger send' });
    }
});

// Update campaign status manually (used by CampaignsPage simulation/completion logic)
router.patch('/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, stats } = req.body;
        const userId = req.user?.id;

        const updateData: any[] = [status, id, userId];
        let statsQuery = '';

        if (stats) {
            statsQuery = `, 
                sent_count = $4, 
                delivered_count = $5, 
                opened_count = $6, 
                failed_count = $7,
                sent_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE sent_at END`;
            updateData.push(stats.sent || 0, stats.delivered || 0, stats.read || 0, stats.failed || 0);
        }

        const result = await query(
            `UPDATE email_campaigns SET 
                status = $1, 
                updated_at = NOW() 
                ${statsQuery}
            WHERE id = $2 AND user_id = $3
            RETURNING *`,
            updateData
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        res.json({ success: true, campaign: result.rows[0] });
    } catch (error: any) {
        console.error('Error updating campaign status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete email campaign
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const result = await query(
            'DELETE FROM email_campaigns WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        res.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting email campaign:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

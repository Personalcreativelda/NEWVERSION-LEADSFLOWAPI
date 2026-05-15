import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { emailService } from '../services/email.service';

const router = Router();
const SETTINGS_KEY = 'smtp_config';

router.get('/settings', requireAuth, async (req, res, next) => {
    try {
        const result = await query(
            `SELECT value FROM settings WHERE user_id = $1 AND key = $2 LIMIT 1`,
            [req.user!.id, SETTINGS_KEY]
        );
        if (!result.rows[0]) return res.json({ success: true, settings: null });
        const settings = JSON.parse(result.rows[0].value);
        // Never return the password
        const { pass, password, ...safe } = settings;
        res.json({ success: true, settings: safe });
    } catch (err) { next(err); }
});

router.post('/settings', requireAuth, async (req, res, next) => {
    try {
        const config = req.body;
        await query(
            `INSERT INTO settings (user_id, key, value, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
            [req.user!.id, SETTINGS_KEY, JSON.stringify(config)]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/test', requireAuth, async (req, res, next) => {
    try {
        const result = await query(
            `SELECT value FROM settings WHERE user_id = $1 AND key = $2 LIMIT 1`,
            [req.user!.id, SETTINGS_KEY]
        );
        if (!result.rows[0]) {
            return res.status(400).json({ success: false, error: 'SMTP não configurado. Salva as configurações primeiro.' });
        }
        const smtpConfig = JSON.parse(result.rows[0].value);
        const toEmail = req.body.toEmail || (req.user as any).email;

        await emailService.sendEmailWithSettings({
            to: toEmail,
            subject: 'Teste de Email - LeadsFlow',
            text: 'Este é um email de teste. Se recebeu este email, as configurações SMTP estão corretas!',
            html: '<p style="font-family:sans-serif;">Este é um email de teste. Se recebeu este email, as configurações SMTP estão corretas! ✅</p>',
        }, smtpConfig);

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message || 'Erro ao enviar email de teste' });
    }
});

export default router;

// TEAM INBOX: Gestão de equipa, convites, atribuição, notas e logs (multi-tenant)
import crypto from 'crypto';
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { emailService } from '../services/email.service';

const router = Router();
router.use(authMiddleware);

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the best available email SMTP config for a user.
 * Priority: active email channel → smtp_config in settings → system env SMTP
 * Returns { config, source } or null if nothing is configured.
 */
async function resolveEmailSender(userId: string): Promise<{ config: any; source: 'channel' | 'smtp_settings' | 'system' } | null> {
    // 1. Active email channel — SMTP config lives in credentials.smtp
    try {
        const channelResult = await query(
            `SELECT credentials, name FROM channels WHERE user_id = $1 AND type = 'email' AND status = 'active' LIMIT 1`,
            [userId]
        );
        const creds = channelResult.rows[0]?.credentials;
        const channelName = channelResult.rows[0]?.name;
        if (creds) {
            const host = creds.smtp?.host;
            const user = creds.smtp?.auth?.user || creds.email;
            const pass = creds.smtp?.auth?.pass || creds.password;
            if (host && user && pass) {
                return {
                    source: 'channel',
                    config: {
                        host,
                        port:      creds.smtp?.port || 587,
                        secure:    creds.smtp?.secure || false,
                        user,
                        pass,
                        fromEmail: creds.email || user,
                        fromName:  creds.from_name || channelName || 'LeadsFlow',
                    },
                };
            }
        }
    } catch { /* channel check not critical */ }

    // 2. SMTP settings saved via /smtp/settings
    try {
        const smtpResult = await query(
            `SELECT value FROM settings WHERE user_id = $1 AND key = 'smtp_config' LIMIT 1`,
            [userId]
        );
        if (smtpResult.rows[0]) {
            const cfg = JSON.parse(smtpResult.rows[0].value);
            if (cfg.host && cfg.user && (cfg.pass || cfg.password)) {
                return { source: 'smtp_settings', config: cfg };
            }
        }
    } catch { /* settings not critical */ }

    // 3. System SMTP (env vars) — fallback for self-hosted deployments
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        return {
            source: 'system',
            config: {
                host:      process.env.SMTP_HOST,
                port:      process.env.SMTP_PORT || '587',
                user:      process.env.SMTP_USER,
                pass:      process.env.SMTP_PASS,
                fromEmail: process.env.SMTP_FROM || process.env.SMTP_USER,
                fromName:  'LeadsFlow',
            },
        };
    }

    return null;
}

async function logActivity(
    conversationId: string,
    actorId: string,
    action: string,
    metadata: Record<string, any> = {}
) {
    await query(
        `INSERT INTO conversation_activity_logs (conversation_id, actor_id, action, metadata)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, actorId, action, JSON.stringify(metadata)]
    );
}

/**
 * Resolve the workspace for the authenticated user.
 * If they are the owner → return their workspace.
 * If they are a team member → return the workspace they belong to.
 * Returns { workspaceId, workspaceOwnerId, memberRole } or null if no workspace found.
 */
async function resolveWorkspace(userId: string) {
    // For team management actions, always prefer the user's OWN workspace first.
    // This ensures owners always manage their own team, not a workspace they were invited to.
    const ownerResult = await query(
        'SELECT id, owner_id FROM workspaces WHERE owner_id = $1 LIMIT 1',
        [userId]
    );
    if (ownerResult.rows[0]) {
        return {
            workspaceId:      ownerResult.rows[0].id as string,
            workspaceOwnerId: userId,
            memberRole:       'owner' as string,
            isOwner:          true,
        };
    }
    // Fall back: user has no own workspace, check if they're a team member elsewhere
    const memberResult = await query(
        `SELECT tm.workspace_id, tm.role, w.owner_id
         FROM team_members tm
         JOIN workspaces w ON w.id = tm.workspace_id
         WHERE tm.user_id = $1 AND tm.status = 'active' AND tm.is_active = true
         LIMIT 1`,
        [userId]
    );
    if (memberResult.rows[0]) {
        return {
            workspaceId:      memberResult.rows[0].workspace_id as string,
            workspaceOwnerId: memberResult.rows[0].owner_id as string,
            memberRole:       memberResult.rows[0].role as string,
            isOwner:          false,
        };
    }
    return null;
}

// ─── WORKSPACE INFO ───────────────────────────────────────────────────────────

// GET /api/team/workspace
router.get('/workspace', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });

        const result = await query(
            `SELECT w.*, u.email AS owner_email, u.name AS owner_name
             FROM workspaces w
             JOIN users u ON u.id = w.owner_id
             WHERE w.id = $1`,
            [ws.workspaceId]
        );
        res.json({ ...result.rows[0], current_user_role: ws.memberRole });
    } catch (err) { next(err); }
});

// ─── TEAM MEMBERS ─────────────────────────────────────────────────────────────

// GET /api/team/members
router.get('/members', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });

        const result = await query(
            `SELECT
               tm.*,
               u.email    AS user_email,
               u.name     AS user_name,
               u.avatar_url AS user_avatar,
               (SELECT COUNT(*) FROM conversations c
                WHERE c.assignee_id = tm.user_id
                  AND c.workspace_id = $1
                  AND c.status NOT IN ('resolved','closed')) AS open_conversations
             FROM team_members tm
             LEFT JOIN users u ON u.id = tm.user_id
             WHERE tm.workspace_id = $1
             ORDER BY tm.created_at ASC`,
            [ws.workspaceId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// POST /api/team/members  (creates invite + team_members row)
router.post('/members', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });
        if (!ws.isOwner && !['admin', 'manager'].includes(ws.memberRole)) {
            return res.status(403).json({ error: 'Sem permissão para convidar membros' });
        }

        const { email, name, role = 'agent', team } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'email e name são obrigatórios' });

        // Check if already a member of this workspace
        const existing = await query(
            'SELECT id FROM team_members WHERE workspace_id = $1 AND email = $2',
            [ws.workspaceId, email.toLowerCase().trim()]
        );
        if (existing.rows[0]) {
            return res.status(409).json({ error: 'Este email já é membro do workspace' });
        }

        // Resolve user_id if account already exists
        const userResult = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        const memberId: string | null = userResult.rows[0]?.id ?? null;
        const memberStatus = memberId ? 'active' : 'pending';

        const memberRow = await query(
            `INSERT INTO team_members
               (workspace_id, owner_id, user_id, email, name, role, team, status, is_active, invited_by, accepted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)
             RETURNING *`,
            [
                ws.workspaceId,
                ws.workspaceOwnerId,
                memberId,
                email.toLowerCase().trim(),
                name,
                role,
                team ?? null,
                memberStatus,
                userId,
                memberId ? new Date().toISOString() : null,
            ]
        );

        // Create invite token (also useful for resend)
        const token = crypto.randomBytes(32).toString('hex');
        const appUrl = process.env.APP_URL || 'http://localhost:3200';
        const inviteUrl = `${appUrl}/accept-invite?token=${token}`;

        await query(
            `INSERT INTO workspace_invites
               (workspace_id, email, role, token, status, invited_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (workspace_id, email) DO UPDATE
               SET token      = EXCLUDED.token,
                   role       = EXCLUDED.role,
                   status     = 'pending',
                   expires_at = NOW() + INTERVAL '7 days',
                   invited_by = EXCLUDED.invited_by`,
            [ws.workspaceId, email.toLowerCase().trim(), role, token, 'pending', userId]
        );

        // Send invite email
        const ownerResult = await query('SELECT name FROM users WHERE id = $1', [userId]);
        const ownerName = ownerResult.rows[0]?.name || 'LeadsFlow';

        let emailSent = false;
        let emailSource: string | null = null;

        const sender = await resolveEmailSender(ws.workspaceOwnerId);
        if (sender) {
            try {
                await emailService.sendTeamInvite(email, name, ownerName, ws.workspaceId, inviteUrl, sender.config);
                emailSent = true;
                emailSource = sender.source;
            } catch (err: any) {
                console.error('[Team] Invite email send failed:', err.message);
            }
        } else {
            console.log('[Team] No email config — invite created but email not sent. Share URL manually:', inviteUrl);
        }

        res.status(201).json({
            ...memberRow.rows[0],
            invite_url:   inviteUrl,
            email_sent:   emailSent,
            email_source: emailSource,
        });
    } catch (err) { next(err); }
});

// PATCH /api/team/members/:id
router.patch('/members/:id', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });
        if (!ws.isOwner && !['admin'].includes(ws.memberRole)) {
            return res.status(403).json({ error: 'Sem permissão para editar membros' });
        }

        const { id } = req.params;
        const { name, role, team, is_active, avatar_url } = req.body;

        const result = await query(
            `UPDATE team_members
             SET name       = COALESCE($1, name),
                 role       = COALESCE($2, role),
                 team       = COALESCE($3, team),
                 is_active  = COALESCE($4, is_active),
                 avatar_url = COALESCE($5, avatar_url),
                 updated_at = NOW()
             WHERE id = $6 AND workspace_id = $7
             RETURNING *`,
            [name, role, team, is_active, avatar_url, id, ws.workspaceId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Membro não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// DELETE /api/team/members/:id
router.delete('/members/:id', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });
        if (!ws.isOwner && !['admin'].includes(ws.memberRole)) {
            return res.status(403).json({ error: 'Sem permissão para remover membros' });
        }

        const { id } = req.params;

        // Prevent removing yourself
        const memberRow = await query('SELECT user_id FROM team_members WHERE id = $1', [id]);
        if (memberRow.rows[0]?.user_id === userId) {
            return res.status(400).json({ error: 'Não podes remover-te do workspace' });
        }

        const result = await query(
            'DELETE FROM team_members WHERE id = $1 AND workspace_id = $2 RETURNING id, email',
            [id, ws.workspaceId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Membro não encontrado' });

        // Also revoke any pending invite
        await query(
            `UPDATE workspace_invites SET status = 'revoked'
             WHERE workspace_id = $1 AND email = $2 AND status = 'pending'`,
            [ws.workspaceId, result.rows[0].email]
        );

        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── WORKSPACE INVITES ────────────────────────────────────────────────────────

// GET /api/team/invites
router.get('/invites', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });

        const result = await query(
            `SELECT wi.*, u.name AS invited_by_name
             FROM workspace_invites wi
             LEFT JOIN users u ON u.id = wi.invited_by
             WHERE wi.workspace_id = $1
             ORDER BY wi.created_at DESC`,
            [ws.workspaceId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// POST /api/team/invites/:id/resend
router.post('/invites/:id/resend', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });

        const { id } = req.params;
        const inviteRow = await query(
            'SELECT * FROM workspace_invites WHERE id = $1 AND workspace_id = $2',
            [id, ws.workspaceId]
        );
        if (!inviteRow.rows[0]) return res.status(404).json({ error: 'Convite não encontrado' });
        if (inviteRow.rows[0].status === 'accepted') {
            return res.status(400).json({ error: 'Convite já aceito' });
        }

        // Regenerate token and reset expiry
        const token = crypto.randomBytes(32).toString('hex');
        const appUrl = process.env.APP_URL || 'http://localhost:3200';
        const inviteUrl = `${appUrl}/accept-invite?token=${token}`;

        await query(
            `UPDATE workspace_invites
             SET token = $1, status = 'pending', expires_at = NOW() + INTERVAL '7 days'
             WHERE id = $2`,
            [token, id]
        );

        const inv = inviteRow.rows[0];
        const ownerResult = await query('SELECT name FROM users WHERE id = $1', [userId]);
        const ownerName = ownerResult.rows[0]?.name || 'LeadsFlow';

        let emailSent = false;
        let emailSource: string | null = null;

        const sender = await resolveEmailSender(ws.workspaceOwnerId);
        if (sender) {
            try {
                await emailService.sendTeamInvite(inv.email, inv.email, ownerName, ws.workspaceId, inviteUrl, sender.config);
                emailSent = true;
                emailSource = sender.source;
            } catch (err: any) {
                console.error('[Team] Resend invite email send failed:', err.message);
            }
        }

        res.json({ success: true, invite_url: inviteUrl, email_sent: emailSent, email_source: emailSource });
    } catch (err) { next(err); }
});

// DELETE /api/team/invites/:id  (revoke)
router.delete('/invites/:id', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const ws = await resolveWorkspace(userId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });

        const { id } = req.params;
        const result = await query(
            `UPDATE workspace_invites SET status = 'revoked'
             WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
             RETURNING id`,
            [id, ws.workspaceId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Convite não encontrado ou já processado' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── CONVERSATION ASSIGNMENT ──────────────────────────────────────────────────

// POST /api/team/conversations/:conversationId/assign
router.post('/conversations/:conversationId/assign', async (req, res, next) => {
    try {
        const actorId = req.user!.id;
        const { conversationId } = req.params;
        const { assignee_id, assigned_team, note } = req.body;

        const ws = await resolveWorkspace(actorId);
        if (!ws) return res.status(404).json({ error: 'Workspace não encontrado' });

        const convResult = await query(
            'SELECT id, workspace_id, assignee_id FROM conversations WHERE id = $1',
            [conversationId]
        );
        const conv = convResult.rows[0];
        if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
        if (conv.workspace_id && conv.workspace_id !== ws.workspaceId) {
            return res.status(403).json({ error: 'Acesso negado a esta conversa' });
        }

        const previousAssigneeId = conv.assignee_id;

        await query(
            `UPDATE conversations
             SET assignee_id   = $1,
                 assigned_team = $2,
                 assigned_at   = $3,
                 assigned_by   = $4,
                 updated_at    = NOW()
             WHERE id = $5`,
            [
                assignee_id ?? null,
                assigned_team ?? null,
                assignee_id ? new Date().toISOString() : null,
                assignee_id ? actorId : null,
                conversationId,
            ]
        );

        await query(
            `INSERT INTO conversation_assignments
               (conversation_id, user_id, assignee_id, assigned_team, assigned_by, note)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [conversationId, ws.workspaceOwnerId, assignee_id ?? null, assigned_team ?? null, actorId, note ?? null]
        );

        const action = assignee_id ? 'assigned' : 'unassigned';
        await logActivity(conversationId, actorId, action, {
            previous_assignee_id: previousAssigneeId,
            new_assignee_id:      assignee_id ?? null,
            assigned_team:        assigned_team ?? null,
        });

        res.json({ success: true });
    } catch (err) { next(err); }
});

// PATCH /api/team/conversations/:conversationId/status
router.patch('/conversations/:conversationId/status', async (req, res, next) => {
    try {
        const actorId = req.user!.id;
        const { conversationId } = req.params;
        const { status, priority } = req.body;

        const allowed = ['open', 'pending', 'resolved', 'closed', 'snoozed'];
        if (status && !allowed.includes(status)) {
            return res.status(400).json({ error: `status inválido: ${status}` });
        }

        const convResult = await query(
            'SELECT id, status, priority FROM conversations WHERE id = $1',
            [conversationId]
        );
        if (!convResult.rows[0]) return res.status(404).json({ error: 'Conversa não encontrada' });
        const prev = convResult.rows[0];

        await query(
            `UPDATE conversations
             SET status     = COALESCE($1, status),
                 priority   = COALESCE($2, priority),
                 updated_at = NOW()
             WHERE id = $3`,
            [status ?? null, priority ?? null, conversationId]
        );

        if (status && status !== prev.status) {
            await logActivity(conversationId, actorId, 'status_changed', {
                from: prev.status,
                to:   status,
            });
        }
        res.json({ success: true });
    } catch (err) { next(err); }
});

// GET /api/team/conversations/:conversationId/assignments
router.get('/conversations/:conversationId/assignments', async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const result = await query(
            `SELECT ca.*,
               ua.name  AS assignee_name,  ua.email AS assignee_email,
               ub.name  AS assigned_by_name
             FROM conversation_assignments ca
             LEFT JOIN users ua ON ua.id = ca.assignee_id
             LEFT JOIN users ub ON ub.id = ca.assigned_by
             WHERE ca.conversation_id = $1
             ORDER BY ca.created_at DESC`,
            [conversationId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── INTERNAL NOTES ───────────────────────────────────────────────────────────

router.get('/conversations/:conversationId/notes', async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const result = await query(
            `SELECT n.*, u.name AS author_name, u.email AS author_email, u.avatar_url AS author_avatar
             FROM conversation_internal_notes n
             JOIN users u ON u.id = n.author_id
             WHERE n.conversation_id = $1
             ORDER BY n.created_at ASC`,
            [conversationId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

router.post('/conversations/:conversationId/notes', async (req, res, next) => {
    try {
        const authorId = req.user!.id;
        const { conversationId } = req.params;
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: 'content é obrigatório' });

        const result = await query(
            `INSERT INTO conversation_internal_notes (conversation_id, author_id, content)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [conversationId, authorId, content.trim()]
        );
        await logActivity(conversationId, authorId, 'note_added', { note_id: result.rows[0].id });

        const noteWithAuthor = await query(
            `SELECT n.*, u.name AS author_name, u.email AS author_email, u.avatar_url AS author_avatar
             FROM conversation_internal_notes n
             JOIN users u ON u.id = n.author_id
             WHERE n.id = $1`,
            [result.rows[0].id]
        );
        res.status(201).json(noteWithAuthor.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/conversations/:conversationId/notes/:noteId', async (req, res, next) => {
    try {
        const authorId = req.user!.id;
        const { conversationId, noteId } = req.params;
        const result = await query(
            'DELETE FROM conversation_internal_notes WHERE id = $1 AND author_id = $2 AND conversation_id = $3 RETURNING id',
            [noteId, authorId, conversationId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Nota não encontrada' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── ACTIVITY LOGS ────────────────────────────────────────────────────────────

router.get('/conversations/:conversationId/activity', async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const result = await query(
            `SELECT al.*, u.name AS actor_name, u.email AS actor_email, u.avatar_url AS actor_avatar
             FROM conversation_activity_logs al
             LEFT JOIN users u ON u.id = al.actor_id
             WHERE al.conversation_id = $1
             ORDER BY al.created_at DESC
             LIMIT 50`,
            [conversationId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── ROUTING RULES ───────────────────────────────────────────────────────────

router.get('/routing-rules', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const result = await query(
            'SELECT * FROM routing_rules WHERE owner_id = $1 ORDER BY priority ASC, created_at ASC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

router.post('/routing-rules', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const { name, conditions, action_type, action_data, priority = 0, is_active = true } = req.body;
        if (!name) return res.status(400).json({ error: 'name é obrigatório' });

        const result = await query(
            `INSERT INTO routing_rules (owner_id, name, conditions, action_type, action_data, priority, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [userId, name, JSON.stringify(conditions ?? []), action_type ?? 'assign_agent', JSON.stringify(action_data ?? {}), priority, is_active]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

router.patch('/routing-rules/:id', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { name, conditions, action_type, action_data, priority, is_active } = req.body;

        const result = await query(
            `UPDATE routing_rules
             SET name        = COALESCE($1, name),
                 conditions  = COALESCE($2::jsonb, conditions),
                 action_type = COALESCE($3, action_type),
                 action_data = COALESCE($4::jsonb, action_data),
                 priority    = COALESCE($5, priority),
                 is_active   = COALESCE($6, is_active),
                 updated_at  = NOW()
             WHERE id = $7 AND owner_id = $8
             RETURNING *`,
            [
                name ?? null,
                conditions ? JSON.stringify(conditions) : null,
                action_type ?? null,
                action_data ? JSON.stringify(action_data) : null,
                priority ?? null,
                is_active ?? null,
                id, userId,
            ]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Regra não encontrada' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/routing-rules/:id', async (req, res, next) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const result = await query(
            'DELETE FROM routing_rules WHERE id = $1 AND owner_id = $2 RETURNING id',
            [id, userId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Regra não encontrada' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

export default router;

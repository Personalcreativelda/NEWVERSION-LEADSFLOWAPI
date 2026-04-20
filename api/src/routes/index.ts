import { Router } from 'express';
import authRoutes from './auth.routes';
import leadsRoutes from './leads.routes';
import contactsRoutes from './contacts.routes';
import campaignsRoutes from './campaigns.routes';
import messagesRoutes from './messages.routes';
import analyticsRoutes from './analytics.routes';
import whatsappRoutes from './whatsapp.routes';
import integrationsRoutes from './integrations.routes';
import usersRoutes from './users.routes';
import plansRoutes from './plans.routes';
import adminPlansRoutes from './admin-plans.routes';
import adminRoutes from './admin.routes';
import notificationsRoutes from './notifications.routes';
import securityRoutes from './security.routes';
import webhooksRoutes from './webhooks.routes';
import leadNotesRoutes from './lead-notes.routes';
import scheduledConversationsRoutes from './scheduled-conversations.routes';
import inboxRoutes from './inbox.routes';
import emailCampaignsRoutes from './email-campaigns';
import smsCampaignsRoutes from './sms-campaigns';
// INBOX: Importar rotas de canais e assistentes
import channelsRoutes from './channels.routes';
import aiAssistantsRoutes from './ai-assistants.routes';
import assistantsRoutes from './assistants.routes';
import voiceAgentsRoutes from './voice-agents.routes';
import userWebhooksRoutes from './user-webhooks.routes';
import versionRoutes from './version.routes';
// Lead Tracking: Importar rotas de rastreamento de leads
import leadsTrackingRoutes from './leads-tracking.routes';
// Conversation Tags: Importar rotas de etiquetas de conversas
import conversationTagsRoutes from './conversation-tags.routes';
// Groups: Importar rotas de gerenciamento de grupos WhatsApp
import groupsRoutes from './groups.routes';
// Remarketing: Flow builder de re-engajamento
import remarketingRoutes from './remarketing.routes';
// AI Remarketing: Scoring inteligente e geração de mensagens
import aiRemarketingRoutes from './ai-remarketing.routes';
// Plan enforcement middleware (blocks writes when plan is expired or lead limit reached)
import { requireAuth } from '../middleware/auth.middleware';
import { planEnforcement } from '../middleware/plan-enforcement.middleware';

const router = Router();

// Shorthand: auth + plan enforcement applied before route handler
// (internal router.use(authMiddleware) inside each route file is a benign no-op re-run)
const withPlan = [requireAuth, planEnforcement];

// ── Public / exempt routes (no plan enforcement) ────────────────────────────
router.use('/auth', authRoutes);
router.use('/plans', plansRoutes);        // must stay accessible so users can upgrade
router.use('/webhooks', webhooksRoutes);  // external Stripe / provider webhooks
router.use('/version', versionRoutes);

// ── Routes with plan enforcement ────────────────────────────────────────────
router.use('/leads', withPlan, leadsRoutes);
router.use('/leads-tracking', withPlan, leadsTrackingRoutes);
router.use('/inbox/conversation-tags', withPlan, conversationTagsRoutes);
router.use('/contacts', withPlan, contactsRoutes);
router.use('/campaigns', withPlan, campaignsRoutes);
router.use('/messages', withPlan, messagesRoutes);
router.use('/analytics', withPlan, analyticsRoutes);
router.use('/whatsapp', withPlan, whatsappRoutes);
router.use('/integrations', withPlan, integrationsRoutes);
router.use('/inbox', withPlan, inboxRoutes);
router.use('/email-campaigns', withPlan, emailCampaignsRoutes);
router.use('/sms-campaigns', withPlan, smsCampaignsRoutes);
router.use('/channels', withPlan, channelsRoutes);
router.use('/ai-assistants', withPlan, aiAssistantsRoutes);
router.use('/assistants', withPlan, assistantsRoutes);
router.use('/voice-agents', withPlan, voiceAgentsRoutes);
router.use('/user-webhooks', withPlan, userWebhooksRoutes);
router.use('/lead-notes', withPlan, leadNotesRoutes);
router.use('/scheduled-conversations', withPlan, scheduledConversationsRoutes);
router.use('/groups', withPlan, groupsRoutes);
router.use('/remarketing', withPlan, remarketingRoutes);
router.use('/ai-remarketing', withPlan, aiRemarketingRoutes);

// ── Settings / admin (auth required, plan NOT enforced) ──────────────────────
router.use('/users', usersRoutes);
router.use('/user', usersRoutes);         // Alias for compatibility
router.use('/admin/plans', adminPlansRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/security', securityRoutes);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;

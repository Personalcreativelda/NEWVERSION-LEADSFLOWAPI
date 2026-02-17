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
import notificationsRoutes from './notifications.routes';
import securityRoutes from './security.routes';
import webhooksRoutes from './webhooks.routes';
import leadNotesRoutes from './lead-notes.routes';
import scheduledConversationsRoutes from './scheduled-conversations.routes';
import inboxRoutes from './inbox.routes';
import emailCampaignsRoutes from './email-campaigns';
// INBOX: Importar rotas de canais e assistentes
import channelsRoutes from './channels.routes';
import aiAssistantsRoutes from './ai-assistants.routes';
import assistantsRoutes from './assistants.routes';
import userWebhooksRoutes from './user-webhooks.routes';
import versionRoutes from './version.routes';
// Lead Tracking: Importar rotas de rastreamento de leads
import leadsTrackingRoutes from './leads-tracking.routes';
// Conversation Tags: Importar rotas de etiquetas de conversas
import conversationTagsRoutes from './conversation-tags.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/leads', leadsRoutes);
router.use('/leads-tracking', leadsTrackingRoutes);
router.use('/inbox/conversation-tags', conversationTagsRoutes);
router.use('/contacts', contactsRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/messages', messagesRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/users', usersRoutes);
router.use('/user', usersRoutes); // Alias for compatibility
router.use('/plans', plansRoutes);
router.use('/admin/plans', adminPlansRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/security', securityRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/lead-notes', leadNotesRoutes);
router.use('/scheduled-conversations', scheduledConversationsRoutes);
router.use('/inbox', inboxRoutes);
router.use('/email-campaigns', emailCampaignsRoutes);
// INBOX: Registrar rotas de canais e assistentes
router.use('/channels', channelsRoutes);
router.use('/ai-assistants', aiAssistantsRoutes);
router.use('/assistants', assistantsRoutes);
router.use('/user-webhooks', userWebhooksRoutes);
router.use('/version', versionRoutes);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;

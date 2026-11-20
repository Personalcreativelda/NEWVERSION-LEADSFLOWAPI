import { query } from '../database/connection';
import { notificationsService } from './notifications.service';
import { recomputeEffectiveEntitlement } from './billing-entitlement.service';

/**
 * Plan Expiration Service
 * Verifica periodicamente se os planos dos usuários expiraram
 * e os reverte automaticamente para o plano free
 */

const CHECK_INTERVAL = 60 * 60 * 1000; // Verificar a cada 1 hora

let intervalId: ReturnType<typeof setInterval> | null = null;

const checkExpiredPlans = async () => {
  try {
    // Buscar usuários com plano expirado (plan_expires_at < NOW() e plano != free)
    const result = await query(`
      SELECT id, email, name, plan, plan_expires_at
      FROM users
      WHERE plan_expires_at IS NOT NULL 
        AND plan_expires_at < NOW()
        AND plan != 'free'
    `);

    if (result.rows.length === 0) {
      return;
    }

    console.log(`[PlanExpiration] Found ${result.rows.length} expired plans to downgrade`);

    for (const user of result.rows) {
      try {
        await query(
          `UPDATE billing_subscriptions
           SET status = 'expired', auto_renew = FALSE, updated_at = NOW()
           WHERE user_id = $1
             AND current_period_end IS NOT NULL
             AND current_period_end <= NOW()
             AND status = ANY($2::varchar[])`,
          [user.id, ['active', 'trialing', 'grace_period', 'cancel_at_period_end', 'cancelled']],
        );

        const effective = await recomputeEffectiveEntitlement(user.id, undefined, 'expired');
        if (effective.planId !== 'free') {
          console.log(`[PlanExpiration] Fonte expirada para ${user.email}; plano efetivo continua ${effective.planId}`);
          continue;
        }

        console.log(`[PlanExpiration] ⬇️ Downgraded ${user.email} from ${user.plan} to free (expired: ${user.plan_expires_at})`);

        // Criar notificação para o usuário
        try {
          await notificationsService.createNotification(
            user.id,
            'plan_expired',
            'Plano expirado',
            `O seu plano ${user.plan} expirou. A conta passou para o plano gratuito.`,
            'alert-triangle',
            { previousPlan: user.plan, expiredAt: user.plan_expires_at },
            { actionUrl: '/dashboard/plan', category: 'system', priority: 'high' },
          );
        } catch (notifErr) {
          console.warn(`[PlanExpiration] Could not create notification for ${user.email}:`, notifErr);
        }

        // Aviso aos administradores (sino e email, conforme Admin → Definições)
        void notificationsService.sendAdminNotification(
          'expirationNotifications',
          'admin_plan_expired',
          'Plano expirou',
          `O plano ${user.plan} de ${user.email} expirou e a conta passou para o plano grátis.`,
          'alert-triangle',
          { userId: user.id, email: user.email, previousPlan: user.plan },
        );
      } catch (updateErr) {
        console.error(`[PlanExpiration] Failed to downgrade ${user.email}:`, updateErr);
      }
    }

    console.log(`[PlanExpiration] ✅ Processed ${result.rows.length} expired plans`);
  } catch (error) {
    console.error('[PlanExpiration] Error checking expired plans:', error);
  }
};

export const planExpirationService = {
  start() {
    // Verificar imediatamente na inicialização
    checkExpiredPlans();

    // Agendar verificação periódica
    intervalId = setInterval(checkExpiredPlans, CHECK_INTERVAL);
    console.log('[PlanExpiration] Service started - checking every 1 hour');
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log('[PlanExpiration] Service stopped');
    }
  },

  // Verificação manual (pode ser chamada via API admin)
  async checkNow() {
    await checkExpiredPlans();
  },
};

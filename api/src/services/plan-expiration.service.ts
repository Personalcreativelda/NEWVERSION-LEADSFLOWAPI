import { query } from '../database/connection';

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

    const freeLimits = JSON.stringify({ leads: 100, messages: 100, massMessages: 200 });

    for (const user of result.rows) {
      try {
        await query(
          `UPDATE users 
           SET plan = 'free', 
               subscription_plan = 'free',
               subscription_status = 'expired',
               plan_limits = $1,
               plan_expires_at = NULL,
               updated_at = NOW()
           WHERE id = $2`,
          [freeLimits, user.id]
        );

        console.log(`[PlanExpiration] ⬇️ Downgraded ${user.email} from ${user.plan} to free (expired: ${user.plan_expires_at})`);

        // Criar notificação para o usuário
        try {
          await query(
            `INSERT INTO notifications (user_id, type, title, description, icon, metadata)
             VALUES ($1, 'plan_expired', 'Plano Expirado', $2, 'alert-triangle', $3)`,
            [
              user.id,
              `Seu plano ${user.plan} expirou. Você foi revertido para o plano gratuito. Faça upgrade para continuar com todos os recursos.`,
              JSON.stringify({ previousPlan: user.plan, expiredAt: user.plan_expires_at }),
            ]
          );
        } catch (notifErr) {
          console.warn(`[PlanExpiration] Could not create notification for ${user.email}:`, notifErr);
        }

        // Criar notificação para o admin
        try {
          const adminResult = await query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
          if (adminResult.rows.length > 0) {
            await query(
              `INSERT INTO notifications (user_id, type, title, description, icon, metadata)
               VALUES ($1, 'admin_plan_expired', 'Plano Expirou', $2, 'alert-triangle', $3)`,
              [
                adminResult.rows[0].id,
                `O plano ${user.plan} do usuário ${user.email} expirou e foi revertido para free.`,
                JSON.stringify({ userId: user.id, email: user.email, previousPlan: user.plan }),
              ]
            );
          }
        } catch (adminNotifErr) {
          // Silently ignore admin notification errors
        }
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

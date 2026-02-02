import { RouteContext } from './index';
import { kvStore } from './kv_store';

// Admin endpoints
export async function handleAdminRoutes(
  pathname: string,
  method: string,
  ctx: RouteContext
): Promise<Response | null> {
  // Check if user is admin (você pode implementar sua própria lógica de verificação)
  const isAdmin = await checkIfAdmin(ctx.userId);
  
  if (!isAdmin) {
    return new Response(
      JSON.stringify({ success: false, message: 'Acesso negado. Apenas administradores.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // GET /admin/users - List all users
  if (pathname === '/admin/users' && method === 'GET') {
    return handleGetUsers(ctx);
  }

  // POST /admin/activate-plan - Activate plan for a user
  if (pathname === '/admin/activate-plan' && method === 'POST') {
    return handleActivatePlan(ctx);
  }

  return null;
}

async function checkIfAdmin(userId: string): Promise<boolean> {
  try {
    // Get user profile
    const userKey = `user:${userId}`;
    const userProfile = await kvStore.get(userKey);
    
    if (!userProfile) {
      console.log(`[Admin Check] User profile not found for userId: ${userId}`);
      return false;
    }

    // Check if user is admin (accept both leadflow and leadsflow variants)
    const isAdmin = userProfile.isAdmin === true || 
                    userProfile.email === 'admin@leadflow.com' ||
                    userProfile.email === 'admin@leadsflow.com';
    
    console.log(`[Admin Check] User ${userProfile.email} - isAdmin: ${isAdmin}`);
    return isAdmin;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

async function handleGetUsers(ctx: RouteContext): Promise<Response> {
  try {
    console.log('[Admin] Loading all users... (using getByPrefix v2)');
    
    // Get all user keys using getByPrefix
    const allUsers: any[] = [];
    
    try {
      // Get all keys starting with 'user:'
      console.log('[Admin] Calling kvStore.getByPrefix("user:")...');
      const usersData = await kvStore.getByPrefix('user:');
      console.log(`[Admin] getByPrefix returned ${usersData?.length || 0} items`);
      
      if (!usersData || !Array.isArray(usersData)) {
        console.error('[Admin] getByPrefix did not return an array:', usersData);
        throw new Error('getByPrefix returned invalid data');
      }
      
      for (const userData of usersData) {
        try {
          if (userData && userData.email) {
            allUsers.push({
              id: userData.id,
              email: userData.email,
              name: userData.name,
              plan: userData.plan || 'free',
              planExpiresAt: userData.planExpiresAt,
              createdAt: userData.createdAt,
            });
          }
        } catch (error) {
          console.error(`[Admin] Error processing user data:`, error);
        }
      }
    } catch (kvError: any) {
      console.error('[Admin] KV error:', kvError);
      console.error('[Admin] KV error message:', kvError?.message);
      console.error('[Admin] Available kvStore functions:', Object.keys(kvStore));
      throw new Error(`KV operation failed: ${kvError?.message}`);
    }

    // Sort by creation date (newest first)
    allUsers.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    console.log(`[Admin] Returning ${allUsers.length} users`);
    return new Response(
      JSON.stringify({
        success: true,
        users: allUsers,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Admin] CRITICAL ERROR getting users:', error);
    console.error('[Admin] Error message:', error?.message);
    console.error('[Admin] Error stack:', error?.stack);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleActivatePlan(ctx: RouteContext): Promise<Response> {
  try {
    const body = ctx.body as any;
    const { userId, planId, expiresAt } = body;

    if (!userId || !planId) {
      return new Response(
        JSON.stringify({ success: false, message: 'userId e planId são obrigatórios' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile
    const userKey = `user:${userId}`;
    const userProfile = await kvStore.get(userKey);

    if (!userProfile) {
      return new Response(
        JSON.stringify({ success: false, message: 'Usuário não encontrado' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Define plan limits
    const planLimits: Record<string, any> = {
      free: {
        leads: 100,
        messages: 100,
        massMessages: 200,
        bulkMessages: 200,
        campaigns: 3,
      },
      business: {
        leads: 500,
        messages: 500,
        massMessages: 1000,
        bulkMessages: 1000,
        campaigns: 50,
      },
      enterprise: {
        leads: -1, // unlimited
        messages: -1,
        massMessages: -1,
        bulkMessages: -1,
        campaigns: -1,
      },
    };

    const limits = planLimits[planId] || planLimits.free;

    // Update user profile
    const updatedProfile = {
      ...userProfile,
      plan: planId,
      planExpiresAt: expiresAt || null,
      limits,
      updatedAt: new Date().toISOString(),
    };

    await kvStore.set(userKey, updatedProfile);

    // Log activity
    const activityKey = `activity:${userId}:${Date.now()}`;
    await kvStore.set(activityKey, {
      userId,
      action: 'plan_activated_by_admin',
      planId,
      expiresAt,
      timestamp: new Date().toISOString(),
      adminId: ctx.userId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Plano ativado com sucesso',
        user: updatedProfile,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error activating plan:', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

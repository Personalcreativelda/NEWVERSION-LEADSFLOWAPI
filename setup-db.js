import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '168.231.104.15',
  port: 5433,
  database: 'postgres',
  user: 'postgres',
  password: 'Mam11Me8DUEnp6Quq8N5c9msIBVH9ZCCeK7aZt0Ga6azkdKGvwzKJrCxtl6Hh6a6',
});

async function setup() {
  try {
    console.log('[DB Setup] Conectando ao PostgreSQL...');
    
    // Add plan columns to users table if they don't exist
    console.log('Checking users table for plan columns...');
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free' REFERENCES plans(id),
      ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Colunas de plano adicionadas/verificadas na tabela users');

    // Create plans table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,
        price_annual DECIMAL(10, 2) NOT NULL DEFAULT 0,
        features JSONB NOT NULL DEFAULT '[]',
        limits JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Tabela plans criada/verificada');

    // Insert default plans if they don't exist
    await pool.query(`
      INSERT INTO plans (id, name, description, price_monthly, price_annual, features, limits)
      VALUES 
        ('free', 'Free', 'Plano gratuito para começar', 0, 0, 
          '["100 leads", "100 mensagens individuais/mês", "200 mensagens em massa/mês", "3 campanhas ativas", "Suporte básico"]'::jsonb,
          '{"leads": 100, "messages": 100, "massMessages": 200}'::jsonb
        ),
        ('business', 'Business', 'Para pequenos negócios', 20, 100,
          '["500 leads", "500 mensagens individuais/mês", "1.000 mensagens em massa/mês", "50 campanhas ativas", "Suporte prioritário", "Integrações avançadas"]'::jsonb,
          '{"leads": 500, "messages": 500, "massMessages": 1000}'::jsonb
        ),
        ('enterprise', 'Enterprise', 'Para empresas em crescimento', 59, 200,
          '["Leads ilimitados", "Mensagens individuais ilimitadas", "Mensagens em massa ilimitadas", "Campanhas ilimitadas", "Suporte VIP 24/7", "API dedicada", "Gestor de conta"]'::jsonb,
          '{"leads": -1, "messages": -1, "massMessages": -1}'::jsonb
        )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        price_annual = EXCLUDED.price_annual,
        features = EXCLUDED.features,
        limits = EXCLUDED.limits;
    `);
    console.log('✅ Planos inseridos/atualizados');

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        is_read BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Tabela notifications criada/verificada');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_plans_is_active ON plans(is_active);
    `);
    console.log('✅ Índice idx_plans_is_active criado');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
    `);
    console.log('✅ Índice idx_users_plan criado');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    `);
    console.log('✅ Índice idx_notifications_user_id criado');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    `);
    console.log('✅ Índice idx_notifications_is_read criado');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
    `);
    console.log('✅ Índice idx_notifications_created_at criado');

    // Verify
    const result = await pool.query(`
      SELECT tablename FROM pg_tables WHERE tablename IN ('notifications', 'plans', 'users') ORDER BY tablename;
    `);
    
    console.log('\n✅ Tabelas criadas:');
    result.rows.forEach(row => console.log(`  - ${row.tablename}`));

    // Show plans
    const plansResult = await pool.query(`SELECT id, name, price_monthly FROM plans ORDER BY price_monthly;`);
    console.log('\n✅ Planos no banco:');
    plansResult.rows.forEach(row => console.log(`  - ${row.id}: ${row.name} ($${row.price_monthly}/mês)`));

    // Show users with plans
    const usersResult = await pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN plan IS NOT NULL THEN 1 END) as with_plan FROM users;`);
    console.log('\n✅ Usuários no banco:');
    console.log(`  - Total: ${usersResult.rows[0].total}`);
    console.log(`  - Com plano: ${usersResult.rows[0].with_plan}`);

    await pool.end();
    console.log('\n✅ Setup completo!');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

setup();

import { query } from '../database/connection';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    annual: number;
  };
  paymentLinks: {
    monthly: string | null;
    annual: string | null;
  };
  features: string[];
  limits: {
    leads: number;
    messages: number;
    massMessages: number;
  };
}

export interface PlanRow {
  id: string;
  name: string;
  description: string;
  price_monthly: string;
  price_annual: string;
  payment_link_monthly: string | null;
  payment_link_annual: string | null;
  features: string[];
  limits: {
    leads: number;
    messages: number;
    massMessages: number;
  };
  is_active: boolean;
}

export const plansService = {
  async getAllPlans(): Promise<Plan[]> {
    const result = await query(
      `SELECT id, name, description, price_monthly, price_annual, payment_link_monthly, payment_link_annual, features, limits
       FROM plans
       WHERE is_active = true
       ORDER BY price_monthly ASC`
    );

    return result.rows.map((row: PlanRow) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: {
        monthly: parseFloat(row.price_monthly),
        annual: parseFloat(row.price_annual),
      },
      paymentLinks: {
        monthly: row.payment_link_monthly,
        annual: row.payment_link_annual,
      },
      features: row.features,
      limits: row.limits,
    }));
  },

  async getPlanById(planId: string): Promise<Plan | null> {
    const result = await query(
      `SELECT id, name, description, price_monthly, price_annual, payment_link_monthly, payment_link_annual, features, limits
       FROM plans
       WHERE id = $1 AND is_active = true`,
      [planId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as PlanRow;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: {
        monthly: parseFloat(row.price_monthly),
        annual: parseFloat(row.price_annual),
      },
      paymentLinks: {
        monthly: row.payment_link_monthly,
        annual: row.payment_link_annual,
      },
      features: row.features,
      limits: row.limits,
    };
  },

  async createPlan(
    id: string,
    name: string,
    description: string,
    priceMonthly: number,
    priceAnnual: number,
    features: string[],
    limits: Record<string, number>
  ): Promise<Plan> {
    const result = await query(
      `INSERT INTO plans (id, name, description, price_monthly, price_annual, features, limits)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, price_monthly, price_annual, features, limits`,
      [id, name, description, priceMonthly, priceAnnual, JSON.stringify(features), JSON.stringify(limits)]
    );

    const row = result.rows[0] as PlanRow;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: {
        monthly: parseFloat(row.price_monthly),
        annual: parseFloat(row.price_annual),
      },
      features: row.features,
      limits: row.limits,
    };
  },

  async updatePlan(
    id: string,
    updates: Partial<{
      name: string;
      description: string;
      price_monthly: number;
      price_annual: number;
      features: string[];
      limits: Record<string, number>;
    }>
  ): Promise<Plan | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.price_monthly !== undefined) {
      fields.push(`price_monthly = $${paramCount++}`);
      values.push(updates.price_monthly);
    }
    if (updates.price_annual !== undefined) {
      fields.push(`price_annual = $${paramCount++}`);
      values.push(updates.price_annual);
    }
    if (updates.features !== undefined) {
      fields.push(`features = $${paramCount++}`);
      values.push(JSON.stringify(updates.features));
    }
    if (updates.limits !== undefined) {
      fields.push(`limits = $${paramCount++}`);
      values.push(JSON.stringify(updates.limits));
    }

    if (fields.length === 0) {
      return this.getPlanById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE plans
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, name, description, price_monthly, price_annual, features, limits`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as PlanRow;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: {
        monthly: parseFloat(row.price_monthly),
        annual: parseFloat(row.price_annual),
      },
      features: row.features,
      limits: row.limits,
    };
  },

  async validatePlanId(planId: string): Promise<boolean> {
    const result = await query(
      `SELECT id FROM plans WHERE id = $1 AND is_active = true`,
      [planId]
    );
    return result.rows.length > 0;
  },
};

import { query } from '../database/connection';

export interface ConversationTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon?: string;
  order_index: number;
  is_default: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationTagAssignment {
  id: string;
  conversation_id: string;
  tag_id: string;
  assigned_at: string;
  assigned_by: string;
}

export class ConversationTagsService {
  /**
   * Criar novas etiquetas padrão para um usuário
   */
  async createDefaultTags(userId: string) {
    const defaultTags = [
      { name: 'Novo', color: '#3B82F6', icon: '🆕', description: 'Conversas novas' },
      { name: 'VIP', color: '#F59E0B', icon: '⭐', description: 'Clientes VIP' },
      { name: 'Urgente', color: '#EF4444', icon: '🔥', description: 'Mensagens urgentes' },
      { name: 'Respondido', color: '#10B981', icon: '✅', description: 'Já respondida' },
      { name: 'Aguardando Resposta', color: '#8B5CF6', icon: '⏳', description: 'Aguardando resposta do cliente' },
      { name: 'Spam', color: '#6B7280', icon: '🚫', description: 'Possível spam' },
    ];

    const created: ConversationTag[] = [];

    for (let i = 0; i < defaultTags.length; i++) {
      const tag = defaultTags[i];
      const result = await query(
        `INSERT INTO conversation_tags (
          user_id, name, color, icon, order_index, is_default, description
        ) VALUES ($1, $2, $3, $4, $5, true, $6)
         RETURNING *`,
        [userId, tag.name, tag.color, tag.icon, i, tag.description]
      );
      created.push(result.rows[0]);
    }

    console.log(`[ConvTags] ✅ ${created.length} tags padrão criadas para usuário ${userId}`);
    return created;
  }

  /**
   * Obter todas as etiquetas de um usuário
   */
  async getUserTags(userId: string): Promise<ConversationTag[]> {
    const result = await query(
      `SELECT * FROM conversation_tags 
       WHERE user_id = $1 
       ORDER BY order_index ASC, created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Criar nova etiqueta personalizada
   */
  async createTag(
    userId: string,
    data: {
      name: string;
      color?: string;
      icon?: string;
      description?: string;
    }
  ): Promise<ConversationTag> {
    // Obter próximo order_index
    const maxResult = await query(
      `SELECT MAX(order_index) as max_order FROM conversation_tags WHERE user_id = $1`,
      [userId]
    );
    const nextOrder = (maxResult.rows[0]?.max_order || -1) + 1;

    const result = await query(
      `INSERT INTO conversation_tags (
        user_id, name, color, icon, order_index, description
      ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, data.name, data.color || '#3B82F6', data.icon || null, nextOrder, data.description || null]
    );

    console.log(`[ConvTags] ✅ Tag criada: ${data.name} para usuário ${userId}`);
    return result.rows[0];
  }

  /**
   * Atualizar etiqueta
   */
  async updateTag(userId: string, tagId: string, data: Partial<ConversationTag>): Promise<ConversationTag> {
    const result = await query(
      `UPDATE conversation_tags 
       SET name = COALESCE($1, name),
           color = COALESCE($2, color),
           icon = COALESCE($3, icon),
           description = COALESCE($4, description),
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [data.name || null, data.color || null, data.icon || null, data.description || null, tagId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Tag não encontrada');
    }

    console.log(`[ConvTags] ✅ Tag atualizada: ${tagId}`);
    return result.rows[0];
  }

  /**
   * Reordenar etiquetas
   */
  async reorderTags(userId: string, tagIds: string[]): Promise<void> {
    for (let i = 0; i < tagIds.length; i++) {
      await query(
        `UPDATE conversation_tags 
         SET order_index = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3`,
        [i, tagIds[i], userId]
      );
    }

    console.log(`[ConvTags] ✅ Tags reordenadas para usuário ${userId}`);
  }

  /**
   * Deletar etiqueta
   */
  async deleteTag(userId: string, tagId: string): Promise<void> {
    // Remover todas as atribuições primeiro (cascade)
    await query(
      `DELETE FROM conversation_tag_assignments WHERE tag_id = $1`,
      [tagId]
    );

    const result = await query(
      `DELETE FROM conversation_tags WHERE id = $1 AND user_id = $2`,
      [tagId, userId]
    );

    if (result.rows.length === 0 && result.rowCount === 0) {
      throw new Error('Tag não encontrada');
    }

    console.log(`[ConvTags] ✅ Tag deletada: ${tagId}`);
  }

  /**
   * Adicionar etiqueta a uma conversa
   */
  async addTagToConversation(conversationId: string, tagId: string, assignedBy: string = 'system'): Promise<ConversationTagAssignment> {
    // Verificar se já tem essa tag
    const existingResult = await query(
      `SELECT id FROM conversation_tag_assignments 
       WHERE conversation_id = $1 AND tag_id = $2`,
      [conversationId, tagId]
    );

    if (existingResult.rows.length > 0) {
      console.log(`[ConvTags] ℹ️ Tag já foi assinalada: ${tagId}`);
      return existingResult.rows[0];
    }

    const result = await query(
      `INSERT INTO conversation_tag_assignments (
        conversation_id, tag_id, assigned_by
      ) VALUES ($1, $2, $3)
       RETURNING *`,
      [conversationId, tagId, assignedBy]
    );

    console.log(`[ConvTags] ✅ Tag adicionada à conversa: ${tagId}`);
    return result.rows[0];
  }

  /**
   * Remover etiqueta de uma conversa
   */
  async removeTagFromConversation(conversationId: string, tagId: string): Promise<void> {
    const result = await query(
      `DELETE FROM conversation_tag_assignments 
       WHERE conversation_id = $1 AND tag_id = $2`,
      [conversationId, tagId]
    );

    console.log(`[ConvTags] ✅ Tag removida da conversa: ${tagId}`);
  }

  /**
   * Obter todas as etiquetas de uma conversa
   */
  async getConversationTags(conversationId: string): Promise<ConversationTag[]> {
    const result = await query(
      `SELECT ct.* FROM conversation_tags ct
       INNER JOIN conversation_tag_assignments cta ON ct.id = cta.tag_id
       WHERE cta.conversation_id = $1
       ORDER BY ct.order_index ASC`,
      [conversationId]
    );

    return result.rows;
  }

  /**
   * Atualizar tags de uma conversa (replace all)
   */
  async setConversationTags(conversationId: string, tagIds: string[], assignedBy: string = 'system'): Promise<ConversationTag[]> {
    // Remover todas as tags existentes
    await query(
      `DELETE FROM conversation_tag_assignments WHERE conversation_id = $1`,
      [conversationId]
    );

    // Adicionar novas tags
    if (tagIds.length > 0) {
      for (const tagId of tagIds) {
        await this.addTagToConversation(conversationId, tagId, assignedBy);
      }
    }

    return this.getConversationTags(conversationId);
  }

  /**
   * Obter conversas com uma etiqueta específica
   */
  async getConversationsByTag(userId: string, tagId: string, filters?: { limit?: number; offset?: number }): Promise<any[]> {
    let sql = `
      SELECT DISTINCT c.* 
      FROM conversations c
      INNER JOIN conversation_tag_assignments cta ON c.id = cta.conversation_id
      WHERE c.user_id = $1 AND cta.tag_id = $2
      ORDER BY c.last_message_at DESC
    `;

    const params: any[] = [userId, tagId];
    let paramIndex = 3;

    if (filters?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Obter estatísticas de tags do usuário
   */
  async getUserTagsStats(userId: string): Promise<any[]> {
    const result = await query(
      `SELECT 
        ct.id,
        ct.name,
        ct.color,
        ct.icon,
        COUNT(cta.id) as conversation_count,
        MAX(c.last_message_at) as last_used
       FROM conversation_tags ct
       LEFT JOIN conversation_tag_assignments cta ON ct.id = cta.tag_id
       LEFT JOIN conversations c ON cta.conversation_id = c.id AND c.user_id = $1
       WHERE ct.user_id = $1
       GROUP BY ct.id, ct.name, ct.color, ct.icon
       ORDER BY ct.order_index ASC`,
      [userId]
    );

    return result.rows;
  }
}

export const conversationTagsService = new ConversationTagsService();

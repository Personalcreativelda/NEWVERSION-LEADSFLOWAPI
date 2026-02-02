// INBOX: Service para gerenciar canais de comunicação com suporte a migração legado
import { query } from '../database/connection';

export interface Channel {
    id: string;
    user_id: string;
    type: 'whatsapp' | 'facebook' | 'instagram' | 'telegram';
    name: string;
    status: 'active' | 'inactive' | 'error' | 'connecting';
    credentials: any;
    settings: any;
    last_sync_at?: string;
    created_at: string;
    updated_at: string;
}

export class ChannelsService {
    /**
     * Lista todos os canais do usuário, migrando configurações antigas se necessário
     */
    async findAll(userId: string): Promise<Channel[]> {
        // 1. Verificar se existe conexão legado no settings
        const settingsResult = await query(
            `SELECT key, value FROM settings 
             WHERE user_id = $1 
             AND key IN ('whatsapp_connected', 'whatsapp_instance_name', 'whatsapp_profile_name')`,
            [userId]
        );

        const settingsMap = settingsResult.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        // Se tiver conectado no sistema antigo
        if (settingsMap.whatsapp_connected === 'true' && settingsMap.whatsapp_instance_name) {
            // Verificar se já existe migrado
            const existingChannel = await query(
                `SELECT id FROM channels 
                 WHERE user_id = $1 
                 AND type = 'whatsapp' 
                 AND credentials->>'instance_name' = $2`,
                [userId, settingsMap.whatsapp_instance_name]
            );

            // Se não existe, cria (Auto-Import)
            if (existingChannel.rows.length === 0) {
                console.log(`[Channels] Migrating legacy WhatsApp instance: ${settingsMap.whatsapp_instance_name}`);
                await this.create({
                    type: 'whatsapp',
                    name: settingsMap.whatsapp_profile_name || 'WhatsApp (Migrado)',
                    status: 'active',
                    credentials: {
                        instance_name: settingsMap.whatsapp_instance_name,
                        migrated: true
                    }
                }, userId);
            }
        }

        // 2. Retornar lista atualizada
        const result = await query(
            'SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    }

    /**
     * Busca canal por ID
     */
    async findById(id: string, userId: string): Promise<Channel | null> {
        const result = await query(
            'SELECT * FROM channels WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        return result.rows[0] || null;
    }

    /**
     * Busca canal por tipo e instance_id (para WhatsApp)
     */
    async findByInstanceId(instanceId: string, userId: string): Promise<Channel | null> {
        const result = await query(
            `SELECT * FROM channels 
             WHERE user_id = $1 
             AND type = 'whatsapp' 
             AND (credentials->>'instance_name' = $2 OR credentials->>'instance_id' = $2)`,
            [userId, instanceId]
        );
        return result.rows[0] || null;
    }

    /**
     * Busca canais por tipo
     */
    async findByType(type: string, userId: string): Promise<Channel[]> {
        const result = await query(
            `SELECT * FROM channels 
             WHERE user_id = $1 
             AND type = $2
             ORDER BY created_at DESC`,
            [userId, type]
        );
        return result.rows;
    }

    /**
     * Cria novo canal
     */
    async create(data: Partial<Channel>, userId: string): Promise<Channel> {
        const result = await query(
            `INSERT INTO channels (user_id, type, name, status, credentials, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [
                userId,
                data.type,
                data.name,
                data.status || 'inactive',
                JSON.stringify(data.credentials || {}),
                JSON.stringify(data.settings || {})
            ]
        );
        return result.rows[0];
    }

    /**
     * Atualiza canal
     */
    async update(id: string, data: Partial<Channel>, userId: string): Promise<Channel | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
            fields.push(`name = $${paramIndex++}`);
            values.push(data.name);
        }

        if (data.status !== undefined) {
            fields.push(`status = $${paramIndex++}`);
            values.push(data.status);
        }

        if (data.credentials !== undefined) {
            fields.push(`credentials = $${paramIndex++}`);
            values.push(JSON.stringify(data.credentials));
        }

        if (data.settings !== undefined) {
            fields.push(`settings = $${paramIndex++}`);
            values.push(JSON.stringify(data.settings));
        }

        if (data.last_sync_at !== undefined) {
            fields.push(`last_sync_at = $${paramIndex++}`);
            values.push(data.last_sync_at);
        }

        if (fields.length === 0) {
            return this.findById(id, userId);
        }

        values.push(id, userId);
        const result = await query(
            `UPDATE channels SET ${fields.join(', ')} 
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
            values
        );

        return result.rows[0] || null;
    }

    /**
     * Remove canal
     */
    async delete(id: string, userId: string): Promise<boolean> {
        const result = await query(
            'DELETE FROM channels WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Atualiza status do canal
     */
    async updateStatus(id: string, status: Channel['status'], userId: string): Promise<void> {
        await query(
            'UPDATE channels SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
            [status, id, userId]
        );
    }

    /**
     * Sincroniza última atividade
     */
    async updateLastSync(id: string, userId: string): Promise<void> {
        await query(
            'UPDATE channels SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
    }
}

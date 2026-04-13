const { Pool } = require('pg');
const pool = new Pool({
  host: '168.231.104.15', port: 5433, user: 'postgres',
  password: 'Mam11Me8DUEnp6Quq8N5c9msIBVH9ZCCeK7aZt0Ga6azkdKGvwzKJrCxtl6Hh6a6',
  database: 'postgres', ssl: false
});

async function main() {
  const r = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM conversations) as convs,
      (SELECT COUNT(*) FROM messages) as msgs,
      (SELECT COUNT(*) FROM channels) as channels,
      (SELECT COUNT(*) FROM conversations WHERE last_message_at > NOW() - INTERVAL '7 days') as recent_convs
  `);
  console.log('DB State:', r.rows[0]);

  const channels = await pool.query(`SELECT id, type, name, status, user_id, credentials->>'instance_id' as instance_id FROM channels ORDER BY created_at DESC LIMIT 10`);
  console.log('\nChannels:');
  channels.rows.forEach(c => console.log(' -', c.type, c.name, c.status, 'user:', c.user_id, 'instance:', c.instance_id));

  const convs = await pool.query(`SELECT id, user_id, channel_id, status, last_message_at, unread_count FROM conversations ORDER BY last_message_at DESC NULLS LAST LIMIT 5`);
  console.log('\nRecent Conversations:');
  convs.rows.forEach(c => console.log(' -', c.id, 'user:', c.user_id, 'channel:', c.channel_id, 'unread:', c.unread_count, 'last:', c.last_message_at));

  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });

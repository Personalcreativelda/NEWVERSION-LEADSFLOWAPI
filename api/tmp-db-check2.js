const { Pool } = require('pg');
const pool = new Pool({
  host: '168.231.104.15', port: 5433, user: 'postgres',
  password: 'Mam11Me8DUEnp6Quq8N5c9msIBVH9ZCCeK7aZt0Ga6azkdKGvwzKJrCxtl6Hh6a6',
  database: 'postgres', ssl: false
});

async function main() {
  // Per-user conversation counts
  const userConvs = await pool.query(`
    SELECT u.email, u.id, COUNT(c.id) as conv_count,
           MAX(c.last_message_at) as last_message
    FROM users u
    LEFT JOIN conversations c ON c.user_id = u.id
    GROUP BY u.id, u.email
    ORDER BY last_message DESC NULLS LAST
    LIMIT 10
  `);
  console.log('\n=== Users with conversation counts ===');
  userConvs.rows.forEach(r => console.log(` [${r.email}] convs: ${r.conv_count}, last: ${r.last_message}`));

  // Sample remote_jids to check format
  const jids = await pool.query(`SELECT DISTINCT remote_jid, channel_id FROM conversations where remote_jid is not null LIMIT 20`);
  console.log('\n=== Sample remote_jids ===');
  jids.rows.forEach(r => console.log(`  ${r.remote_jid} (channel: ${r.channel_id})`));

  // Check if WhatsApp Cloud webhook is configured
  const cloudChannels = await pool.query(`SELECT id, name, user_id, credentials FROM channels WHERE type = 'whatsapp_cloud'`);
  console.log('\n=== WhatsApp Cloud channels ===');
  cloudChannels.rows.forEach(r => {
    const creds = typeof r.credentials === 'string' ? JSON.parse(r.credentials) : r.credentials;
    console.log(` [${r.name}] user: ${r.user_id}, phone_number_id: ${creds?.phone_number_id}, webhook_verify_token: ${creds?.webhook_verify_token ? 'set' : 'missing'}`);
  });

  // Recent messages
  const msgs = await pool.query(`SELECT id, user_id, direction, channel, content, created_at, external_id FROM messages ORDER BY created_at DESC LIMIT 5`);
  console.log('\n=== Recent messages ===');
  msgs.rows.forEach(r => console.log(` [${r.created_at}] user:${r.user_id} dir:${r.direction} ch:${r.channel}: ${r.content?.substring(0,50)}`));

  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });

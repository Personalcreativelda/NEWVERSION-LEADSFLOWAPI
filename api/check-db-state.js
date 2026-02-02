// Script para verificar estado do banco de dados
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

async function check() {
  console.log('Verificando banco de dados...\n');
  
  try {
    // Check conversations
    const convs = await pool.query('SELECT * FROM conversations LIMIT 10');
    console.log('=== CONVERSATIONS ===');
    console.log('Total:', convs.rows.length);
    convs.rows.forEach(c => {
      console.log('  ID:', c.id);
      console.log('  Remote JID:', c.remote_jid);
      console.log('  Lead ID:', c.lead_id);
      console.log('  Channel ID:', c.channel_id);
      console.log('  ---');
    });
  } catch(e) {
    console.log('Conversations table error:', e.message);
  }
  
  try {
    // Check messages
    const msgs = await pool.query('SELECT id, conversation_id, lead_id, direction, content, created_at FROM messages ORDER BY created_at DESC LIMIT 10');
    console.log('\n=== MESSAGES ===');
    console.log('Total:', msgs.rows.length);
    msgs.rows.forEach(m => {
      console.log('  ID:', m.id);
      console.log('  Conversation ID:', m.conversation_id);
      console.log('  Lead ID:', m.lead_id);
      console.log('  Direction:', m.direction);
      console.log('  Content:', m.content?.substring(0, 50));
      console.log('  ---');
    });
  } catch(e) {
    console.log('Messages table error:', e.message);
  }
  
  try {
    // Check channels
    const channels = await pool.query('SELECT id, name, status, type FROM channels LIMIT 10');
    console.log('\n=== CHANNELS ===');
    console.log('Total:', channels.rows.length);
    channels.rows.forEach(ch => {
      console.log('  ID:', ch.id);
      console.log('  Name:', ch.name);
      console.log('  Type:', ch.type);
      console.log('  Status:', ch.status);
      console.log('  ---');
    });
  } catch(e) {
    console.log('Channels table error:', e.message);
  }
  
  await pool.end();
  process.exit(0);
}

check();

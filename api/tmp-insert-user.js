const { createClient } = require('@supabase/supabase-js');

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, TEST_USER_ID } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase env vars');
  }
  if (!TEST_USER_ID) {
    throw new Error('Missing TEST_USER_ID env var');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const payload = { id: TEST_USER_ID };
  const { data, error } = await supabase.from('users').insert(payload).select();
  console.log('Insert data:', data);
  console.log('Insert error:', error);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

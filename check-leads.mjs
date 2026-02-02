import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.from('leads').select('*').limit(1);
  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No leads found.');
    return;
  }

  console.log('Sample lead keys:', Object.keys(data[0]));
  console.log('Sample lead data:', data[0]);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

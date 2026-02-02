const { createClient } = require('@supabase/supabase-js');

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase env vars');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'users')
    .eq('table_schema', 'public')
    .order('ordinal_position');
  if (error) {
    console.error('Error describing users:', error);
  } else {
    console.log('users columns:', data);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

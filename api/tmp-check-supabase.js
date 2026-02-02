const { createClient } = require('@supabase/supabase-js');

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase env vars');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: leadsSample, error: leadsError } = await supabase.from('leads').select('*').limit(1);
  console.log('Leads error:', leadsError ? { message: leadsError.message, details: leadsError.details } : null);
  console.log('Leads sample keys:', leadsSample?.[0] ? Object.keys(leadsSample[0]) : []);

  const { data: usersSample, error: usersError } = await supabase.from('users').select('*').limit(5);
  console.log('Users error:', usersError ? { message: usersError.message, details: usersError.details } : null);
  console.log('Users sample:', usersSample);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

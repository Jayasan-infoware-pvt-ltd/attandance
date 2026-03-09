const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase configuration. Check SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
}

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = {
  supabaseAuth,
  supabaseAdmin
};

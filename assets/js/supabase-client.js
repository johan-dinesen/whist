// All four modules use the same anonymous Supabase session and token.
// A single promise prevents simultaneous background initialization from
// racing to sign in or signing out another module's session.
let clientPromise = null;
export function getWhistClient() {
  if (!clientPromise) clientPromise = (async () => {
    const cfg = await import('./config.js');
    if (!cfg.SUPABASE_URL?.startsWith('https://') ||
        !cfg.SUPABASE_PUBLISHABLE_KEY ||
        cfg.SUPABASE_URL.includes('YOUR-') ||
        cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR-')) {
      throw new Error('Supabase mangler opsætning i assets/js/config.js');
    }
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2');
    const client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
    const {data,error} = await client.auth.getSession();
    if (error) throw error;
    let session = data.session;
    if (session && session.user?.is_anonymous === false) {
      const {error:logoutError} = await client.auth.signOut();
      if (logoutError) throw logoutError;
      session = null;
    }
    if (!session) {
      const {data:anon,error:anonError} = await client.auth.signInAnonymously();
      if (anonError) throw anonError;
      session = anon.session;
    }
    if (!session) throw new Error('Kunne ikke oprette anonym Supabase-session');
    return client;
  })();
  return clientPromise;
}

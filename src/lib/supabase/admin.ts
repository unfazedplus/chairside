import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv, getServerEnv } from "@/lib/env";

/**
 * Service-role client: BYPASSES Row Level Security.
 *
 * Reserved for trusted server paths that authenticate the caller some other
 * way, e.g. the public booking endpoint (no session) and Stripe webhooks
 * (signature verified). Never import this into a Client Component.
 */
export function createAdminClient() {
  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();

  return createSupabaseClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

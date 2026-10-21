import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Rows are validated on the way in rather than trusted. Generated Supabase
 * types would give compile-time safety, but they require a live project; Zod
 * gives the same guarantee at the boundary and also guards against a schema
 * drift that generated types would silently hide.
 */
export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  deposit_percent: z.number().int(),
});

export const membershipSchema = z.object({
  role: z.enum(["owner", "manager", "stylist"]),
  organizations: organizationSchema.nullable(),
});

export type Membership = z.infer<typeof membershipSchema>;

/**
 * Organizations the signed-in user belongs to. RLS already restricts the rows;
 * the explicit join keeps the query readable and the payload small.
 */
export async function listMyOrganizations(): Promise<Membership[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug, timezone, deposit_percent)")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load organizations: ${error.message}`);

  return z.array(membershipSchema).parse(data ?? []);
}

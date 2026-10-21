import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Parsed lazily (not at module scope) so `next build` does not explode when
 * secrets are absent in a CI environment that only typechecks.
 */
export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}. See .env.example.`,
    );
  }

  return parsed.data;
}

/**
 * Service-role credentials bypass Row Level Security. Only import this from
 * server code that has already authorised the caller.
 */
export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing. See .env.example.");
  }

  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must never be called from the browser.");
  }

  return parsed.data;
}

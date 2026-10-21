import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";

export const metadata = { title: "Sign in" };

// Reads searchParams (post-auth error state), so it is request-bound.
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/dashboard";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <Link href="/" className="text-sm text-ink-muted hover:text-ink">
        ← Back
      </Link>

      <div className="mt-8 rounded-card border border-line bg-paper-raised p-7 shadow-[0_1px_2px_rgba(26,22,20,0.04)]">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Chairside</h1>
        <p className="mt-1.5 mb-6 text-sm text-ink-muted">
          Manage your chair, your roster, and your bookings.
        </p>

        {params.error === "link_expired" ? (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-sm text-clay-strong"
          >
            That sign-in link has expired or was already used. Request a new one.
          </p>
        ) : null}

        <LoginForm next={next} />
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { listMyOrganizations } from "@/lib/organizations/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this route; this is defence in depth so a
  // misconfigured matcher cannot leak data.
  if (!user) redirect("/login");

  const memberships = await listMyOrganizations();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-muted">Signed in as {user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-line bg-paper-raised px-3.5 py-2 text-sm font-medium hover:border-clay/40"
          >
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium tracking-wide text-ink-muted uppercase">
          Your shops
        </h2>

        {memberships.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {memberships.map((membership) => {
              const org = membership.organizations;
              return (
                <li
                  key={`${org?.id ?? "none"}-${membership.role}`}
                  className="rounded-card border border-line bg-paper-raised p-4"
                >
                  <p className="font-medium">{org?.name ?? "Unnamed shop"}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {membership.role} · {org?.timezone ?? "no timezone set"} ·{" "}
                    {org ? `${org.deposit_percent}% deposit` : "no deposit policy"}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-3 rounded-card border border-dashed border-line bg-paper-raised p-6 text-sm text-ink-muted">
            No shop yet. Create one to set opening hours, add services, and publish a
            booking page.
          </div>
        )}
      </section>
    </main>
  );
}

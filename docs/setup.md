# How the pieces fit together

Three services, three different jobs. Newcomers often expect GitHub to contain
everything; it does not contain your database.

| Service | Holds | Think of it as |
| --- | --- | --- |
| **GitHub** | Your source code and its history | The filing cabinet |
| **Supabase** | Postgres database, auth users, file storage, edge functions | The back office |
| **Vercel** (later) | A running copy of your app on the internet | The shop front |

The code in GitHub is just text. When that code runs — on your laptop or on
Vercel — it connects to Supabase over HTTPS using a URL and two keys. The
database schema is not inside GitHub as a running thing; it exists as **SQL
migration files** that you *apply* to Supabase.

```text
GitHub (code)  ──deploy──▶  Vercel (running app)  ──HTTPS──▶  Supabase (DB + auth)
     │                                                              ▲
     └────── migrations in supabase/migrations ──────apply─────────┘
```

## The three Supabase keys

Find them in Supabase: **Project Settings → API**.

| Key | Where it goes | Secret? |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | No |
| `anon` / publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No, but do not abuse it |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **Yes. Never commit, never send to the browser** |

The `anon` key is safe to ship to browsers because **Row Level Security** decides
what each row may be read or written. That is why this project has RLS policies
on every table, and why the anon key alone is useless against them.

The `service_role` key **bypasses RLS entirely**. Treat it like a database
password. That is why it has no `NEXT_PUBLIC_` prefix and why `getServerEnv()`
refuses to run in a browser.

## Why `.env.local` is not in Git

`.gitignore` excludes `.env.local`. Only `.env.example` is committed, as
documentation of what is required. If you ever accidentally commit a
`service_role` key, rotate it in the Supabase dashboard immediately — deleting
the commit is not enough, because history and forks retain it.

## One-time setup

### 1. Push the code to GitHub

Your repo exists locally with three commits but **no remote**. Create an empty
repository named `chairside` on GitHub (no README, no .gitignore — you already
have both), then:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/chairside.git
git push -u origin main
```

### 2. Create the Supabase project

In the Supabase dashboard, **New project**. Choose a region near your users,
save the database password somewhere safe.

Then apply the schema from this repo:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`project-ref` is the short id in your project URL:
`https://<project-ref>.supabase.co`.

`db push` applies `supabase/migrations/*.sql` only. The demo data in
`supabase/seed.sql` is for local development; to load it into the cloud project,
paste it into the Supabase **SQL Editor**. Be aware it deletes rows first, so
never run it against real data.

### 3. Configure auth redirects

Magic links fail with confusing errors if this is skipped. In Supabase, go to
**Authentication → URL Configuration** and set:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add both
  - `http://localhost:3000/auth/confirm`
  - `https://<your-production-domain>/auth/confirm`

Without the second entry, sign-in works locally and silently fails in
production.

### 4. Create `.env.local`

```bash
cp .env.example .env.local
```

Fill in the URL, anon key, and service_role key from step 2.

### 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, click **Sign in**, and use your email. The link
arrives by mail and lands on `/auth/confirm`.

## Where GitHub Actions fits in

Later, when CI is added, GitHub runs your tests on every push. Those workflows
also need the Supabase keys, but **not** in code. They go in GitHub:
**Settings → Secrets and variables → Actions**, as repository secrets:

- `SUPABASE_ACCESS_TOKEN` — a personal access token from Supabase
- `SUPABASE_DB_PASSWORD` — the database password
- `SUPABASE_PROJECT_ID` — the project ref

A workflow then reads `${{ secrets.SUPABASE_ACCESS_TOKEN }}`. Same principle as
`.env.local`: secrets are injected at runtime, never committed.

## Local stack vs cloud project

This machine has **no Docker**, so `npm run db:start` will not work here. Two
valid paths:

**Cloud project (works today):** `npx supabase link` then `db push`, as above.
Every schema change is a new migration file that you push again.

**Local stack (needs Docker Desktop):** `npm run db:start`, then
`npm run db:reset` applies migrations *and* seed data. Faster iteration, no
network, safe to destroy. Worth installing eventually, because RLS tests belong
against a real Postgres you can reset freely.

## The mental model to keep

- Committing code does **not** change the database.
- Changing the database means writing a new file in `supabase/migrations/`.
- `.env.local` is per-machine and never shared; `.env.example` is the contract.
- Two keys are public-ish, one is a password.
- RLS is what makes a public key safe.

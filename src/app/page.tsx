import Link from "next/link";

const promises = [
  {
    title: "Booking that respects the clock",
    body: "Availability is generated in your shop's timezone, not the visitor's. Daylight saving, buffers, and closing time are handled before a slot is ever shown.",
  },
  {
    title: "No double bookings, ever",
    body: "A database constraint rejects overlapping appointments at the storage layer, so two people tapping the same 10:00 can never both succeed.",
  },
  {
    title: "Deposits without the chasing",
    body: "Take a card deposit when the booking is made, and let webhooks reconcile the payment even if the browser closes mid-checkout.",
  },
];

export default function HomePage() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <span className="text-lg font-semibold tracking-tight">Chairside</span>
        <Link
          href="/login"
          className="rounded-lg border border-line bg-paper-raised px-3.5 py-2 text-sm font-medium hover:border-clay/40"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto w-full max-w-5xl px-5 pt-10 pb-16">
        <p className="text-sm font-medium tracking-wide text-clay uppercase">
          For salons and barbershops
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          The booking book your chair actually deserves.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">
          Chairside gives independent shops online booking, staff rosters, and card
          deposits — built on a scheduling engine that understands timezones and never
          sells the same slot twice.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-clay px-5 py-2.5 font-medium text-white hover:bg-clay-strong"
          >
            Start with your email
          </Link>
          <a
            href="#how"
            className="rounded-lg border border-line bg-paper-raised px-5 py-2.5 font-medium hover:border-clay/40"
          >
            How availability works
          </a>
        </div>
      </section>

      <section id="how" className="mx-auto w-full max-w-5xl px-5 pb-20">
        <ul className="grid gap-4 sm:grid-cols-3">
          {promises.map((item) => (
            <li
              key={item.title}
              className="rounded-card border border-line bg-paper-raised p-5"
            >
              <h2 className="font-semibold tracking-tight">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-5xl px-5 py-6 text-sm text-ink-muted">
          Chairside is a portfolio project demonstrating multi-tenant Supabase with Row
          Level Security.
        </div>
      </footer>
    </main>
  );
}

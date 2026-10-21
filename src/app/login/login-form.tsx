"use client";

import { useActionState } from "react";

import { requestMagicLink, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(requestMagicLink, initialState);
  const isSent = state.status === "sent";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          aria-describedby="email-hint"
          aria-invalid={state.status === "error" || undefined}
          placeholder="you@yoursalon.com"
          className="w-full rounded-lg border border-line bg-paper-raised px-3.5 py-2.5 text-ink placeholder:text-ink-muted/60 focus:border-clay"
        />
        <p id="email-hint" className="text-xs text-ink-muted">
          We will email you a one-time sign-in link. No password to remember.
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending || isSent}
        className="w-full rounded-lg bg-clay px-4 py-2.5 font-medium text-white transition-colors hover:bg-clay-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Sending link…" : isSent ? "Link sent" : "Email me a sign-in link"}
      </button>

      {state.status !== "idle" && state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={
            state.status === "error"
              ? "rounded-lg border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-sm text-clay-strong"
              : "rounded-lg border border-sage/30 bg-sage/5 px-3.5 py-2.5 text-sm text-sage"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

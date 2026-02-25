"use client";

import { FormEvent, useEffect, useState } from "react";
import { tunnelPublicLogin } from "@/lib/api-client";

export default function TunnelLoginPage() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) {
      setNextPath("/");
      return;
    }
    setNextPath(next);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      const result = await tunnelPublicLogin({
        password,
        next: nextPath,
      });
      window.location.href = result.redirectTo;
    } catch {
      setError("Password is incorrect.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_right,var(--sky-soft),transparent_40%),radial-gradient(circle_at_bottom_left,var(--teal-soft),transparent_35%),var(--background)] p-4 text-[var(--foreground)]">
      <section className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel)]/95 p-6 shadow-xl">
        <h1 className="text-2xl font-bold tracking-tight">External Access Login</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Enter the password to access the public tunnel.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Password</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)]"
              placeholder="Enter tunnel password"
              disabled={submitting}
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || password.trim().length === 0}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Verifying..." : "Log In"}
          </button>
        </form>
      </section>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TunnelAdminStateResponse } from "@codex-app/shared-contracts";
import { disableTunnel, enableTunnel, readTunnelAdminState, tunnelPublicLogout } from "@/lib/api-client";

const POLL_INTERVAL_MS = 3_000;
const PASSWORD_MIN_LENGTH = 8;
const QR_SIZE_PX = 180;

const EMPTY_STATE: TunnelAdminStateResponse = {
  canManage: false,
  status: "off",
  publicUrl: null,
  externalIp: null,
  hasPassword: false,
  lastError: null,
};

function statusLabel(status: TunnelAdminStateResponse["status"]): string {
  switch (status) {
    case "on":
      return "ON";
    case "starting":
      return "STARTING";
    case "error":
      return "ERROR";
    default:
      return "OFF";
  }
}

function buildQrCodeImageUrl(publicUrl: string): string {
  const params = new URLSearchParams({
    size: `${QR_SIZE_PX}x${QR_SIZE_PX}`,
    data: publicUrl,
    qzone: "1",
    format: "png",
    margin: "0",
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

export default function SettingsPage() {
  const [state, setState] = useState<TunnelAdminStateResponse>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"enable" | "disable" | "logout" | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadState = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      const latest = await readTunnelAdminState();
      setState(latest);
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : "Failed to load settings state.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const timer = setInterval(() => {
      void loadState({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loading, loadState]);

  const canEnable = useMemo(() => {
    if (!state.canManage || busy || state.status === "on" || state.status === "starting") {
      return false;
    }
    const normalizedPassword = password.trim();
    const normalizedConfirm = passwordConfirm.trim();
    return (
      normalizedPassword.length >= PASSWORD_MIN_LENGTH &&
      normalizedConfirm.length >= PASSWORD_MIN_LENGTH &&
      normalizedPassword === normalizedConfirm
    );
  }, [busy, password, passwordConfirm, state.canManage, state.status]);

  const canDisable = useMemo(() => {
    if (!state.canManage || busy) {
      return false;
    }
    return state.status === "on" || state.status === "starting" || state.status === "error";
  }, [busy, state.canManage, state.status]);

  const handleEnable = async () => {
    const normalizedPassword = password.trim();
    const normalizedConfirm = passwordConfirm.trim();
    if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (normalizedPassword !== normalizedConfirm) {
      setError("Password confirmation does not match.");
      return;
    }

    try {
      setBusy("enable");
      setError(null);
      setInfo(null);
      const result = await enableTunnel({ password: normalizedPassword });
      setInfo(
        result.status === "on" && result.publicUrl
          ? `Tunnel is enabled: ${result.publicUrl}`
          : "Tunnel start request received. Status will refresh shortly.",
      );
      setPassword("");
      setPasswordConfirm("");
      await loadState({ silent: true });
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : "Failed to start tunnel.");
    } finally {
      setBusy(null);
    }
  };

  const handleDisable = async () => {
    try {
      setBusy("disable");
      setError(null);
      setInfo(null);
      await disableTunnel();
      setPassword("");
      setPasswordConfirm("");
      setInfo("Tunnel disabled. Sessions and password were cleared immediately.");
      await loadState({ silent: true });
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : "Failed to stop tunnel.");
    } finally {
      setBusy(null);
    }
  };

  const handleLogout = async () => {
    try {
      setBusy("logout");
      setError(null);
      setInfo(null);
      await tunnelPublicLogout();
      window.location.href = "/tunnel-login";
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Failed to log out.");
    } finally {
      setBusy(null);
    }
  };

  const statusTone =
    state.status === "on"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : state.status === "starting"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : state.status === "error"
        ? "border-rose-300 bg-rose-50 text-rose-700"
        : "border-slate-300 bg-slate-50 text-slate-700";
  const qrCodeImageUrl = state.publicUrl ? buildQrCodeImageUrl(state.publicUrl) : null;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_right,var(--sky-soft),transparent_40%),radial-gradient(circle_at_bottom_left,var(--teal-soft),transparent_35%),var(--background)] p-4 text-[var(--foreground)] md:p-8">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--panel)]/95 p-5 shadow-xl md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Manage tunnel exposure and the external password gate.</p>
          </div>
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            Go to Chat
          </a>
        </div>

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--panel-strong)]/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--muted-foreground)]">Tunnel Status</span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
              {statusLabel(state.status)}
            </span>
          </div>

          <div className="mt-3 space-y-1 text-sm">
            <p>
              Manage permission:{" "}
              <span className="font-semibold">{state.canManage ? "Localhost admin (editable)" : "Remote user (read-only)"}</span>
            </p>
            <p>
              Password set: <span className="font-semibold">{state.hasPassword ? "Yes" : "No"}</span>
            </p>
            <p className="break-all">
              Public URL:{" "}
              {state.publicUrl ? (
                <a
                  href={state.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--accent)] underline underline-offset-2"
                >
                  {state.publicUrl}
                </a>
              ) : (
                <span className="font-semibold text-[var(--muted-foreground)]">None</span>
              )}
            </p>
            {state.publicUrl && qrCodeImageUrl ? (
              <div className="mt-3 inline-flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3">
                <p className="text-xs font-semibold text-[var(--muted-foreground)]">QR code (scan with mobile camera)</p>
                <a href={state.publicUrl} target="_blank" rel="noreferrer" className="inline-block">
                  <img
                    src={qrCodeImageUrl}
                    alt={`Tunnel URL QR: ${state.publicUrl}`}
                    width={QR_SIZE_PX}
                    height={QR_SIZE_PX}
                    className="h-[180px] w-[180px] rounded-md border border-[var(--border)] bg-white p-1"
                  />
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)]/60 px-3 py-3 text-sm text-[var(--muted-foreground)]">
            Loading status...
          </div>
        ) : null}

        {state.lastError ? (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-800">
            Last error: {state.lastError}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-800">{error}</div>
        ) : null}

        {info ? (
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">{info}</div>
        ) : null}

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <h2 className="text-sm font-bold tracking-wide text-[var(--muted-foreground)]">Tunnel ON Setup</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Password</span>
              <input
                type="password"
                value={password}
                disabled={!state.canManage || !!busy || state.status === "on" || state.status === "starting"}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={`Minimum ${PASSWORD_MIN_LENGTH} characters`}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Confirm Password</span>
              <input
                type="password"
                value={passwordConfirm}
                disabled={!state.canManage || !!busy || state.status === "on" || state.status === "starting"}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="Re-enter the same password"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canEnable}
              onClick={handleEnable}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "enable" ? "Starting..." : "Tunnel ON"}
            </button>

            <button
              type="button"
              disabled={!canDisable}
              onClick={handleDisable}
              className="inline-flex min-h-11 items-center rounded-lg border border-rose-300 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "disable" ? "Stopping..." : "Tunnel OFF"}
            </button>

            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                void loadState();
              }}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>

            <button
              type="button"
              disabled={!!busy}
              onClick={handleLogout}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "logout" ? "Processing..." : "Log out remote session"}
            </button>
          </div>

          {!state.canManage ? (
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              You are currently on a remote connection. Status is visible, but ON/OFF and password changes are allowed only on localhost.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

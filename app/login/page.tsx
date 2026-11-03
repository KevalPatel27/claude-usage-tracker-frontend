"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { BrandMark } from "@/components/brand-mark";
import { apiFetch, authApi } from "@/lib/api";
export default function Login() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [bootstrap, setBootstrap] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (bootstrap)
        await apiFetch("/auth/bootstrap", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(f)),
        });
      else
        await authApi.login(
          String(f.get("username")),
          String(f.get("password")),
        );
      await refresh();
      router.replace("/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-intro">
        <div className="login-brand">
          <BrandMark size={52} />
          <span>
            Usage ledger<small>Claude Code workspace</small>
          </span>
        </div>
        <h1>A clear record of Claude Code usage.</h1>
        <p>
          One ledger for your configured PCs. See what was collected, who each
          device is assigned to, and where reports are missing.
        </p>
        <small>
          Device attribution / measured tokens / honest collection status
        </small>
      </div>
      <section className="login-form">
        <h2>{bootstrap ? "Create the first admin" : "Admin sign in"}</h2>
        <p>
          {bootstrap
            ? "Requires the backend bootstrap secret. Only available before an admin exists."
            : "Manage usage reporting across your Windows PCs."}
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <label>
            Username
            <input
              name="username"
              required
              autoComplete="username"
              maxLength={120}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={bootstrap ? 12 : 1}
              autoComplete={bootstrap ? "new-password" : "current-password"}
            />
          </label>
          {bootstrap && (
            <label>
              Bootstrap secret
              <input
                name="bootstrapSecret"
                type="password"
                required
                autoComplete="off"
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Connecting…" : bootstrap ? "Create admin" : "Sign in"}
          </button>
        </form>
        <button
          className="quiet"
          onClick={() => {
            setBootstrap(!bootstrap);
            setError("");
          }}
        >
          {bootstrap
            ? "Back to sign in"
            : "First time? Create the admin account"}
        </button>
        <p className="footnote">
          Estimated usage cost is separate from subscription billing. Token
          counts do not measure remaining Max allowance.
        </p>
      </section>
    </main>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { resolveClientHomePath } from "@/lib/device";

type TenantOption = { slug: string; name: string };

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const orgHint = searchParams.get("org");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState(orgHint ?? "");
  const [tenantOptions, setTenantOptions] = useState<TenantOption[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function completeLogin(chosenTenant?: string) {
    const forced = nextParam && nextParam !== "/inicio" && nextParam !== "/" ? nextParam : null;
    const dest = forced ?? resolveClientHomePath();
    if (chosenTenant) setTenantSlug(chosenTenant);
    router.push(dest);
    router.refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          tenantSlug: tenantSlug || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        needsTenantPick?: boolean;
        tenants?: TenantOption[];
        ok?: boolean;
      };

      if (!res.ok) {
        setError(data.error ?? "Falha no login");
        return;
      }

      if (data.needsTenantPick && data.tenants?.length) {
        setTenantOptions(data.tenants);
        if (!tenantSlug && data.tenants.length === 1) {
          setTenantSlug(data.tenants[0].slug);
        }
        return;
      }

      setTenantOptions(null);
      await completeLogin(data.ok ? tenantSlug : undefined);
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function onPickTenant(e: FormEvent) {
    e.preventDefault();
    if (!tenantSlug) {
      setError("Escolha a organização");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, tenantSlug }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Falha no login");
        return;
      }

      setTenantOptions(null);
      await completeLogin(tenantSlug);
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (tenantOptions) {
    return (
      <form className="login-form" onSubmit={onPickTenant}>
        {error ? <div className="login-error">{error}</div> : null}
        <p className="login-intro">
          Você tem acesso a mais de uma organização. Escolha qual deseja abrir:
        </p>
        <label className="login-field">
          <span>Organização</span>
          <select
            className="search-input"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            required
          >
            <option value="">— Selecionar —</option>
            {tenantOptions.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
          {loading ? "Entrando…" : "Continuar"}
        </button>
        <button
          type="button"
          className="btn btn-ghost login-submit"
          disabled={loading}
          onClick={() => {
            setTenantOptions(null);
            setTenantSlug(orgHint ?? "");
          }}
        >
          Voltar
        </button>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      {error ? <div className="login-error">{error}</div> : null}

      <label className="login-field">
        <span>E-mail</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="login-field">
        <span>Senha</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

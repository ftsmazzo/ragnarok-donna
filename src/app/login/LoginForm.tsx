"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { resolveClientHomePath } from "@/lib/device";

type TenantOption = { slug: string; name: string };

type LoginFormProps = {
  /** Organização escolhida na tela anterior — sempre enviada no login. */
  tenantSlug: string;
  orgLabel: string;
};

export function LoginForm({ tenantSlug, orgLabel }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantOptions, setTenantOptions] = useState<TenantOption[] | null>(null);
  const [pickedSlug, setPickedSlug] = useState(tenantSlug);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function completeLogin() {
    const forced = nextParam && nextParam !== "/inicio" && nextParam !== "/" ? nextParam : null;
    router.push(forced ?? resolveClientHomePath());
    router.refresh();
  }

  async function doLogin(slug: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, tenantSlug: slug }),
    });
    const data = (await res.json()) as {
      error?: string;
      needsTenantPick?: boolean;
      tenants?: TenantOption[];
      ok?: boolean;
    };

    if (!res.ok) {
      setError(data.error ?? "Falha no login");
      return false;
    }

    if (data.needsTenantPick && data.tenants?.length) {
      setTenantOptions(data.tenants);
      setPickedSlug(slug);
      return false;
    }

    if (data.ok) {
      await completeLogin();
      return true;
    }

    setError("Falha no login");
    return false;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      setTenantOptions(null);
      await doLogin(tenantSlug);
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function onPickTenant(e: FormEvent) {
    e.preventDefault();
    if (!pickedSlug) {
      setError("Escolha a organização");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const ok = await doLogin(pickedSlug);
      if (ok) setTenantOptions(null);
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
          Seu usuário tem acesso a mais de uma marca. Confirme qual abrir:
        </p>
        <label className="login-field">
          <span>Marca</span>
          <select
            className="search-input"
            value={pickedSlug}
            onChange={(e) => setPickedSlug(e.target.value)}
            required
          >
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
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      {error ? <div className="login-error">{error}</div> : null}

      <input type="hidden" name="tenant" value={tenantSlug} />

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
        {loading ? "Entrando…" : `Entrar em ${orgLabel}`}
      </button>
    </form>
  );
}

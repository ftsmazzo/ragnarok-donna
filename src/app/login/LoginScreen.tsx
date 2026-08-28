"use client";

import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/shell/BrandMark";
import { LOGIN_BRANDS, loginBrandForSlug } from "@/lib/login-brands";
import { LoginForm } from "./LoginForm";

export function LoginScreen() {
  const searchParams = useSearchParams();
  const org = searchParams.get("org");
  const brand = org ? loginBrandForSlug(org) : null;

  if (!brand) {
    return (
      <div className="login-page">
        <div className="login-card login-card-wide">
          <h1 className="login-picker-title">Qual negócio você quer acessar?</h1>
          <p className="login-intro">
            Cada marca tem login, dados e painel separados. Escolha abaixo:
          </p>
          <div className="login-org-grid">
            {LOGIN_BRANDS.map((b) => (
              <a
                key={b.slug}
                href={`/login?org=${b.slug}`}
                className="login-org-card"
                style={{ "--login-accent": b.accent } as React.CSSProperties}
              >
                <BrandMark logoSrc={b.logoSrc} alt={b.name} size="lg" />
                <strong>{b.name}</strong>
                <small>{b.tagline}</small>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page" style={{ "--login-accent": brand.accent } as React.CSSProperties}>
      <div className="login-card">
        <div className="login-brand">
          <BrandMark logoSrc={brand.logoSrc} alt={brand.name} size="lg" />
          <div>
            <strong>{brand.name}</strong>
            <small>{brand.tagline}</small>
          </div>
        </div>

        <p className="login-intro">
          Entre com seu e-mail e senha para acessar agenda, caixa e conversas.
        </p>

        <LoginForm tenantSlug={brand.slug} orgLabel={brand.name} />

        <p className="login-switch-org">
          <a href="/login">← Escolher outra marca</a>
        </p>
      </div>
    </div>
  );
}

"use client";

import { BrandMark } from "@/components/shell/BrandMark";
import type { LoginBrand } from "@/lib/login-brands";
import { LoginForm } from "./LoginForm";

type Props = {
  brand: LoginBrand;
};

export function LoginTenantView({ brand }: Props) {
  return (
    <div className="login-page" style={{ "--login-accent": brand.accent } as React.CSSProperties}>
      <div className="login-card">
        <div className="login-brand">
          <BrandMark
            logoSrc={brand.logoSrc}
            alt={brand.name}
            size="lg"
            onDark={brand.logoOnDark}
          />
          <div>
            <strong>{brand.name}</strong>
            <small>{brand.tagline}</small>
          </div>
        </div>

        <p className="login-intro">
          Entre com seu e-mail e senha para acessar agenda, caixa e conversas.
        </p>

        <LoginForm tenantSlug={brand.slug} orgLabel={brand.name} />
      </div>
    </div>
  );
}

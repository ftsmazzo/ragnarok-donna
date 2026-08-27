import { Suspense } from "react";
import { BrandMark } from "@/components/shell/BrandMark";
import { RAGNAROK_BUSINESS_PROFILE } from "@/server/agent/business-profile";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  const brand = RAGNAROK_BUSINESS_PROFILE;
  const logo = brand.brand.logoLocalPath ?? brand.brand.logoUrl;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <BrandMark logoSrc={logo} alt={brand.nomeFantasia} size="lg" />
          <div>
            <strong>{brand.nomeFantasia}</strong>
            <small>{brand.tagline} · Painel operacional</small>
          </div>
        </div>

        <p className="login-intro">
          Entre com seu e-mail e senha para acessar a agenda, o caixa e as conversas
          da Donna.
        </p>

        <Suspense fallback={<p className="login-intro">Carregando…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

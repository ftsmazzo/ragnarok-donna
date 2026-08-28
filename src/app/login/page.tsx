import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Entrar · Donna",
  description: "Painel operacional Donna — agenda, caixa e conversas.",
};

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark" aria-hidden>
            D
          </div>
          <div>
            <strong>Donna</strong>
            <small>Painel operacional · multi-unidade</small>
          </div>
        </div>

        <p className="login-intro">
          Entre com seu e-mail e senha. Se você gerencia mais de uma marca, escolha a
          organização na sequência — sem precisar sair e entrar de novo.
        </p>

        <Suspense fallback={<p className="login-intro">Carregando…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

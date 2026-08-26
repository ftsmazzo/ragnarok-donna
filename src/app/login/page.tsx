import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="sidebar-brand-mark">RD</span>
          <div>
            <strong>RagnaroK&apos;s Barbearia</strong>
            <small>Painel operacional</small>
          </div>
        </div>

        <p className="login-intro">
          Acesso ao tenant <strong>ragnaroks</strong>. Dados migrados do AppBarber permanecem
          disponíveis após autenticação.
        </p>

        <Suspense fallback={<p className="login-intro">Carregando…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

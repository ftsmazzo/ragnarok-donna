import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginScreen } from "./LoginScreen";

export const metadata: Metadata = {
  title: "Entrar · Donna",
  description: "Painel operacional — escolha sua marca e entre.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-page"><p className="login-intro">Carregando…</p></div>}>
      <LoginScreen />
    </Suspense>
  );
}

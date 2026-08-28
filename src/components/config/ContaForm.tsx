"use client";

import { FormEvent, useState, useTransition } from "react";

export function ContaForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("A confirmação não confere com a nova senha");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Não foi possível alterar a senha");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Senha atualizada. Use a nova senha no próximo login.");
    });
  }

  return (
    <form className="config-form" onSubmit={onSubmit}>
      {error ? <div className="login-error">{error}</div> : null}
      {message ? <div className="login-success">{message}</div> : null}

      <label className="login-field">
        <span>E-mail</span>
        <input type="email" value={email} disabled />
      </label>

      <label className="login-field">
        <span>Senha atual</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>

      <label className="login-field">
        <span>Nova senha</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>

      <label className="login-field">
        <span>Confirmar nova senha</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>

      <p className="client-profile-hint">
        A senha vale para <strong>todas as organizações</strong> vinculadas ao seu e-mail
        (ex.: Ragnarok e Donna Elegant). Cada membro da equipe altera a própria senha aqui.
      </p>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Salvando…" : "Atualizar senha"}
      </button>
    </form>
  );
}

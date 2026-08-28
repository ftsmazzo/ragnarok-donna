"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { inviteMemberAction } from "@/app/(painel)/configuracoes/equipe/actions";
import type { MemberRole } from "@/server/types";
import { ROLE_LABELS } from "@/server/permissions/roles";

type BranchOption = { id: string; slug: string; name: string };

type Props = {
  branches: BranchOption[];
  hasEmailConfig: boolean;
};

const ROLES: MemberRole[] = ["owner", "admin", "manager", "readonly"];

export function InviteMemberForm({ branches, hasEmailConfig }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<MemberRole>("manager");
  const [sendInviteEmail, setSendInviteEmail] = useState(hasEmailConfig);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branchId, setBranchId] = useState("");

  const needsBranch = role === "manager" || role === "readonly";

  useEffect(() => {
    setSendInviteEmail(hasEmailConfig);
  }, [hasEmailConfig]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const result = await inviteMemberAction({
        name,
        email,
        password,
        role,
        branchId: branchId || null,
        staffId: null,
        sendInviteEmail,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      let msg = `Usuário ${result.email} criado.`;
      if (result.emailSent) msg += " E-mail enviado.";
      else if (result.tempPassword) msg += ` Senha: ${result.tempPassword}`;
      setSuccess(msg);
      setName("");
      setEmail("");
      setPassword("");
      setBranchId("");
      setRole("manager");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="invite-member-form" onSubmit={onSubmit}>
      <h3 className="panel-subtitle">Outros acessos (gerente, admin ou teste manual)</h3>
      <p className="client-profile-hint">
        Use este formulário para criar um login de teste com seu e-mail. Barbeiros importados ficam
        na lista acima.
      </p>
      {error ? <div className="form-error banner-inline">{error}</div> : null}
      {success ? <div className="banner-success banner-inline">{success}</div> : null}
      <div className="form-grid">
        <label>
          Nome
          <input
            name="name"
            className="search-input"
            required
            disabled={isSubmitting}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          E-mail (login)
          <input
            name="email"
            type="email"
            className="search-input"
            required
            disabled={isSubmitting}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Senha inicial
          <input
            name="password"
            type="text"
            minLength={8}
            className="search-input"
            placeholder="Opcional — gera automaticamente"
            disabled={isSubmitting}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Papel
          <select
            className="search-input"
            value={role}
            disabled={isSubmitting}
            onChange={(e) => setRole(e.target.value as MemberRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {needsBranch ? (
          <label>
            Unidade
            <select
              name="branchId"
              className="search-input"
              required
              disabled={isSubmitting}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">— Selecionar —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {hasEmailConfig ? (
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={sendInviteEmail}
            disabled={isSubmitting}
            onChange={(e) => setSendInviteEmail(e.target.checked)}
          />
          Enviar e-mail com login e senha
        </label>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}

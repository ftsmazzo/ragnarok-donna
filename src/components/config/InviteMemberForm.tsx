"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<MemberRole>("manager");
  const [sendInviteEmail, setSendInviteEmail] = useState(hasEmailConfig);

  const needsBranch = role === "manager" || role === "readonly";

  useEffect(() => {
    setSendInviteEmail(hasEmailConfig);
  }, [hasEmailConfig]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteMemberAction({
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        role,
        branchId: String(fd.get("branchId") ?? "") || null,
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
      e.currentTarget.reset();
      setRole("manager");
      router.refresh();
    });
  }

  return (
    <form className="invite-member-form" onSubmit={onSubmit}>
      <h3 className="panel-subtitle">Outros acessos (gerente, admin…)</h3>
      <p className="client-profile-hint">
        Para barbeiros importados, use a lista acima. Aqui cadastre gerentes, admins ou sócios.
      </p>
      {error ? <div className="form-error banner-inline">{error}</div> : null}
      {success ? <div className="banner-success banner-inline">{success}</div> : null}
      <div className="form-grid">
        <label>
          Nome
          <input name="name" className="search-input" required disabled={pending} />
        </label>
        <label>
          E-mail (login)
          <input name="email" type="email" className="search-input" required disabled={pending} />
        </label>
        <label>
          Senha inicial
          <input
            name="password"
            type="password"
            minLength={8}
            className="search-input"
            placeholder="Opcional — gera automaticamente"
            disabled={pending}
          />
        </label>
        <label>
          Papel
          <select
            className="search-input"
            value={role}
            disabled={pending}
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
            <select name="branchId" className="search-input" required disabled={pending}>
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
            disabled={pending}
            onChange={(e) => setSendInviteEmail(e.target.checked)}
          />
          Enviar e-mail com login e senha
        </label>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}

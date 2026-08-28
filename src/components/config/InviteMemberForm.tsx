"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteMemberAction } from "@/app/(painel)/configuracoes/equipe/actions";
import type { MemberRole } from "@/server/types";
import { ROLE_LABELS } from "@/server/permissions/roles";

type BranchOption = { id: string; slug: string; name: string };

type Props = {
  branches: BranchOption[];
  unlinkedStaff: { id: string; name: string }[];
};

const ROLES: MemberRole[] = ["owner", "admin", "manager", "staff", "readonly"];

export function InviteMemberForm({ branches, unlinkedStaff }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<MemberRole>("staff");

  const needsBranch = role === "manager" || role === "staff";
  const showStaff = role === "staff";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteMemberAction({
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        role,
        branchId: String(fd.get("branchId") ?? "") || null,
        staffId: String(fd.get("staffId") ?? "") || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      e.currentTarget.reset();
      setRole("staff");
      router.refresh();
    });
  }

  return (
    <form className="invite-member-form" onSubmit={onSubmit}>
      <h3 className="panel-subtitle">Criar acesso</h3>
      <p className="client-profile-hint">
        Crie login para sócios, gerentes ou profissionais. Gerente e barbeiro ficam presos à
        unidade escolhida.
      </p>
      {error ? <div className="form-error banner-inline">{error}</div> : null}
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
            required
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
        {showStaff ? (
          <label>
            Profissional (opcional)
            <select name="staffId" className="search-input" disabled={pending}>
              <option value="">— Depois —</option>
              {unlinkedStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}

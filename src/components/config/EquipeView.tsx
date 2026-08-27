"use client";

import { useTransition } from "react";
import type { MemberListItem } from "@/server/members/queries";
import type { MemberRole } from "@/server/types";
import { ROLE_LABELS } from "@/server/permissions/roles";
import { linkStaffAction, updateMemberRoleAction } from "@/app/(painel)/configuracoes/equipe/actions";

type Props = {
  members: MemberListItem[];
  unlinkedStaff: { id: string; name: string }[];
};

const ROLES: MemberRole[] = ["owner", "admin", "manager", "staff", "readonly"];

export function EquipeView({ members, unlinkedStaff }: Props) {
  const [pending, startTransition] = useTransition();

  function onRoleChange(membershipId: string, role: MemberRole) {
    startTransition(async () => {
      await updateMemberRoleAction(membershipId, role);
    });
  }

  function onStaffLink(membershipId: string, staffId: string) {
    startTransition(async () => {
      await linkStaffAction(membershipId, staffId);
    });
  }

  return (
    <>
      <p className="client-profile-hint">
        Defina quem é <strong>Dono</strong>, <strong>Recepção</strong> ou{" "}
        <strong>Barbeiro</strong>. Recepção opera agenda, clientes, comandas, caixa e{" "}
        <strong>Conversas IA</strong>. Barbeiros veem só a própria produção quando
        vinculados a um profissional.
      </p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Papel</th>
              <th>Profissional vinculado</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId}>
                <td>
                  <div className="cell-strong">{m.name}</div>
                  <small className="muted">{m.email}</small>
                </td>
                <td>
                  <select
                    className="search-input"
                    defaultValue={m.role}
                    disabled={pending}
                    onChange={(e) => onRoleChange(m.membershipId, e.target.value as MemberRole)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {m.role === "staff" ? (
                    <select
                      className="search-input"
                      defaultValue={m.staffId ?? ""}
                      disabled={pending}
                      onChange={(e) => onStaffLink(m.membershipId, e.target.value)}
                    >
                      <option value="">— Selecionar —</option>
                      {m.staffId && m.staffName ? (
                        <option value={m.staffId}>{m.staffName}</option>
                      ) : null}
                      {unlinkedStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : m.staffName ? (
                    <span>{m.staffName}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="client-profile-hint muted">
        Novos logins: crie o usuário no banco ou via seed e adicione membership. Convite
        por e-mail entra em sprint futura.
      </p>
    </>
  );
}

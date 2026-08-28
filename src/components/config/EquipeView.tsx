"use client";

import { useTransition } from "react";
import type { MemberListItem, UnlinkedStaffItem } from "@/server/members/queries";
import type { MemberRole } from "@/server/types";
import { ROLE_LABELS, roleRequiresBranch } from "@/server/permissions/roles";
import {
  linkStaffAction,
  updateMemberBranchAction,
  updateMemberRoleAction,
} from "@/app/(painel)/configuracoes/equipe/actions";
import { InviteMemberForm } from "./InviteMemberForm";
import { StaffProvisionPanel } from "./StaffProvisionPanel";

type BranchOption = { id: string; slug: string; name: string };

type Props = {
  members: MemberListItem[];
  unlinkedStaff: UnlinkedStaffItem[];
  branches: BranchOption[];
  hasEmailConfig: boolean;
};

const ROLES: MemberRole[] = ["owner", "admin", "manager", "staff", "readonly"];

export function EquipeView({ members, unlinkedStaff, branches, hasEmailConfig }: Props) {
  const [pending, startTransition] = useTransition();

  function onRoleChange(membershipId: string, role: MemberRole) {
    startTransition(async () => {
      await updateMemberRoleAction(membershipId, role);
    });
  }

  function onBranchChange(membershipId: string, branchId: string) {
    startTransition(async () => {
      await updateMemberBranchAction(membershipId, branchId || null);
    });
  }

  function onStaffLink(membershipId: string, staffId: string) {
    startTransition(async () => {
      await linkStaffAction(membershipId, staffId);
    });
  }

  return (
    <>
      <StaffProvisionPanel staff={unlinkedStaff} hasEmailConfig={hasEmailConfig} />

      <InviteMemberForm branches={branches} hasEmailConfig={hasEmailConfig} />

      <p className="client-profile-hint">
        <strong>Dono</strong> navega entre unidades e vê consolidado.{" "}
        <strong>Gerente</strong> opera uma loja (sem relatórios financeiros).{" "}
        <strong>Barbeiro</strong> vê agenda, comandas e comissões próprias.
      </p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Papel</th>
              <th>Unidade</th>
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
                  {roleRequiresBranch(m.role) || m.role === "readonly" ? (
                    <select
                      className="search-input"
                      defaultValue={m.branchId ?? ""}
                      disabled={pending}
                      onChange={(e) => onBranchChange(m.membershipId, e.target.value)}
                    >
                      <option value="">—</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="muted">Todas</span>
                  )}
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
    </>
  );
}

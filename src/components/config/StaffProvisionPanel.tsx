"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  bulkProvisionStaffAction,
  provisionStaffAction,
} from "@/app/(painel)/configuracoes/equipe/actions";
import type { UnlinkedStaffItem } from "@/server/members/queries";

type Props = {
  staff: UnlinkedStaffItem[];
  hasEmailConfig: boolean;
};

type Feedback = {
  kind: "success" | "error" | "info";
  message: string;
};

export function StaffProvisionPanel({ staff, hasEmailConfig }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customEmail, setCustomEmail] = useState<Record<string, string>>({});

  const withEmail = staff.filter((s) => s.email?.trim());
  const withoutEmail = staff.filter((s) => !s.email?.trim());

  function provisionOne(item: UnlinkedStaffItem, sendInviteEmail: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const result = await provisionStaffAction({
        staffId: item.id,
        email: customEmail[item.id]?.trim() || undefined,
        sendInviteEmail,
      });

      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error });
        return;
      }

      setExpandedId(null);
      let message = `Acesso criado para ${item.name} (${result.email}).`;
      if (result.emailSent) {
        message += " E-mail de boas-vindas enviado.";
      } else if (result.tempPassword) {
        message += ` Senha inicial: ${result.tempPassword}`;
        if (result.emailError) {
          message += ` (e-mail não enviado: ${result.emailError})`;
        }
      }
      setFeedback({ kind: "success", message });
      router.refresh();
    });
  }

  function provisionAll() {
    setFeedback(null);
    startTransition(async () => {
      const result = await bulkProvisionStaffAction(hasEmailConfig);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error });
        return;
      }

      let message = `${result.created} acesso(s) criado(s).`;
      if (result.skipped.length) {
        message += ` ${result.skipped.length} ignorado(s): ${result.skipped
          .slice(0, 3)
          .map((s) => s.name)
          .join(", ")}${result.skipped.length > 3 ? "…" : ""}.`;
      }
      setFeedback({ kind: result.created ? "success" : "info", message });
      router.refresh();
    });
  }

  if (staff.length === 0) {
    return (
      <div className="staff-provision-panel">
        <h3 className="panel-subtitle">Profissionais importados</h3>
        <p className="client-profile-hint muted">
          Todos os profissionais ativos já possuem login vinculado.
        </p>
      </div>
    );
  }

  return (
    <div className="staff-provision-panel">
      <div className="staff-provision-header">
        <div>
          <h3 className="panel-subtitle">Profissionais sem acesso ({staff.length})</h3>
          <p className="client-profile-hint">
            Importados do AppBeleza — selecione e crie login com nome, e-mail, unidade e vínculo
            automáticos.
            {!hasEmailConfig ? (
              <>
                {" "}
                <span className="muted">
                  Configure <code>RESEND_API_KEY</code> para enviar senha por e-mail; sem isso a senha
                  aparece aqui após criar.
                </span>
              </>
            ) : null}
          </p>
        </div>
        {withEmail.length > 1 ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={provisionAll}
          >
            {pending ? "Criando…" : `Criar todos com e-mail (${withEmail.length})`}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <div
          className={`banner-inline${
            feedback.kind === "error"
              ? " form-error"
              : feedback.kind === "success"
                ? " banner-success"
                : " banner-info"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Profissional</th>
              <th>Unidade</th>
              <th>E-mail</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const open = expandedId === s.id;
              const email = s.email?.trim();
              return (
                <tr key={s.id}>
                  <td className="cell-strong">{s.name}</td>
                  <td>{s.branchName ?? "—"}</td>
                  <td>{email || <span className="muted">Sem e-mail</span>}</td>
                  <td className="cell-actions">
                    {open ? (
                      <div className="staff-provision-expand">
                        {!email ? (
                          <input
                            type="email"
                            className="search-input"
                            placeholder="E-mail para login"
                            value={customEmail[s.id] ?? ""}
                            disabled={pending}
                            onChange={(e) =>
                              setCustomEmail((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                          />
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pending}
                          onClick={() => provisionOne(s, hasEmailConfig && !!email)}
                        >
                          Confirmar acesso
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => setExpandedId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={pending}
                        onClick={() => setExpandedId(s.id)}
                      >
                        Criar acesso
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {withoutEmail.length ? (
        <p className="client-profile-hint muted">
          {withoutEmail.length} profissional(is) sem e-mail no cadastro — informe ao criar ou
          cadastre em Profissionais.
        </p>
      ) : null}
    </div>
  );
}

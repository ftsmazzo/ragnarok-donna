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
  whatsappConnected: boolean;
};

type Feedback = {
  kind: "success" | "error" | "info";
  message: string;
};

function formatInviteResult(
  name: string,
  result: Extract<Awaited<ReturnType<typeof provisionStaffAction>>, { ok: true }>
): string {
  let message = `Acesso criado para ${name} (${result.email}).`;
  if (result.emailSent) message += " E-mail enviado.";
  else if (result.emailError) message += ` E-mail: ${result.emailError}.`;
  if (result.whatsappSent) message += " WhatsApp enviado.";
  else if (result.whatsappError) message += ` WhatsApp: ${result.whatsappError}.`;
  if (result.tempPassword) message += ` Senha inicial: ${result.tempPassword}`;
  return message;
}

export function StaffProvisionPanel({ staff, hasEmailConfig, whatsappConnected }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customEmail, setCustomEmail] = useState<Record<string, string>>({});

  const withEmail = staff.filter((s) => s.email?.trim());
  const withoutEmail = staff.filter((s) => !s.email?.trim());

  function provisionOne(item: UnlinkedStaffItem) {
    setFeedback(null);
    startTransition(async () => {
      const result = await provisionStaffAction({
        staffId: item.id,
        email: customEmail[item.id]?.trim() || undefined,
        sendInviteEmail: hasEmailConfig,
        sendInviteWhatsApp: whatsappConnected,
      });

      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error });
        return;
      }

      setExpandedId(null);
      setFeedback({
        kind: "success",
        message: formatInviteResult(item.name, result),
      });
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

      let message = `${result.created} acesso(s) criado(s) com e-mail`;
      if (whatsappConnected) message += " e WhatsApp (quando houver celular)";
      message += ".";
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
            Importados do AppBeleza — um clique cria login, vincula o profissional e envia convite
            por {hasEmailConfig ? "e-mail" : "—"}
            {hasEmailConfig && whatsappConnected ? " + " : ""}
            {whatsappConnected ? "WhatsApp" : hasEmailConfig ? "" : " (senha exibida aqui)"}.
            {!whatsappConnected ? (
              <span className="muted">
                {" "}
                WhatsApp desconectado — pareie em Conversas para enviar pelo Zap.
              </span>
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
            {pending ? "Criando…" : `Criar todos (${withEmail.length})`}
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
              <th>Celular</th>
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
                  <td>{s.phone || <span className="muted">—</span>}</td>
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
                          onClick={() => provisionOne(s)}
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

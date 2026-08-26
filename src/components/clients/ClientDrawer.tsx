"use client";

import { useState, useTransition } from "react";
import type { ClientDetail } from "@/server/clients/queries";
import {
  createClientAction,
  deactivateClientAction,
  reactivateClientAction,
  updateClientAction,
} from "@/app/(painel)/clientes/actions";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatPhone } from "@/lib/format";

type Mode = "new" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  client: ClientDetail | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function ClientDrawer({ open, mode, client, onClose, onSaved }: Props) {
  const [error, setError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [pending, startTransition] = useTransition();

  const isEdit = mode === "edit" && client;
  const isRemoved = Boolean(client?.deletedAt || !client?.isActive);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEdit
        ? await updateClientAction(client.id, formData)
        : await createClientAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.id);
    });
  }

  function handleReactivate() {
    if (!client) return;
    setError("");
    startTransition(async () => {
      const result = await reactivateClientAction(client.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(client.id);
    });
  }

  function handleDeactivateConfirm() {
    if (!client) return;
    setError("");
    startTransition(async () => {
      const result = await deactivateClientAction(client.id);
      setConfirmDeactivate(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(client.id);
    });
  }

  const whatsapp =
    client?.phoneE164?.replace(/\D/g, "") ??
    client?.phone?.replace(/\D/g, "");

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={isEdit ? client.name : "Novo cliente"}
        subtitle={
          isEdit
            ? client.externalSource
              ? `Importado · ${client.externalSource}`
              : "Cadastro manual"
            : "Preencha os dados básicos"
        }
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
            {isEdit && !isRemoved ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmDeactivate(true)}
                disabled={pending}
              >
                Inativar
              </button>
            ) : null}
            {isEdit && isRemoved ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleReactivate}
                disabled={pending}
              >
                Reativar
              </button>
            ) : null}
            {!isRemoved ? (
              <button
                type="submit"
                form="client-form"
                className="btn btn-primary"
                disabled={pending}
              >
                {pending ? "Salvando…" : "Salvar"}
              </button>
            ) : null}
          </>
        }
      >
        {error ? <div className="form-error">{error}</div> : null}

        {isEdit ? (
          <div className="client-meta">
            <div>
              <span className="meta-label">Pontos fidelidade</span>
              <strong>{client.loyaltyPoints.toLocaleString("pt-BR")}</strong>
            </div>
            <div>
              <span className="meta-label">Cadastro</span>
              <span>{formatDateTimeSp(client.createdAt)}</span>
            </div>
            {whatsapp ? (
              <div>
                <span className="meta-label">WhatsApp</span>
                <a
                  href={`https://wa.me/${whatsapp.replace(/^\+/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link-action"
                >
                  Abrir conversa
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <form id="client-form" className="form-stack" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Nome *</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={160}
              defaultValue={client?.name ?? ""}
              disabled={isRemoved}
              autoFocus={!isEdit}
            />
          </label>

          <label className="form-field">
            <span>Telefone / WhatsApp</span>
            <input
              name="phone"
              type="tel"
              maxLength={32}
              defaultValue={client?.phone ?? ""}
              disabled={isRemoved}
              placeholder="(11) 98888-0000"
            />
          </label>

          <label className="form-field">
            <span>E-mail</span>
            <input
              name="email"
              type="email"
              maxLength={200}
              defaultValue={client?.email ?? ""}
              disabled={isRemoved}
            />
          </label>

          <label className="form-field">
            <span>Data de nascimento</span>
            <input
              name="birthDate"
              type="date"
              defaultValue={client?.birthDate ?? ""}
              disabled={isRemoved}
            />
          </label>

          <label className="form-field">
            <span>Observações</span>
            <textarea
              name="notes"
              rows={4}
              maxLength={2000}
              defaultValue={client?.notes ?? ""}
              disabled={isRemoved}
              placeholder="Preferências, alergias, profissional favorito…"
            />
          </label>
        </form>
      </Drawer>

      <Modal
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        title="Inativar cliente"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmDeactivate(false)}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeactivateConfirm}
              disabled={pending}
            >
              {pending ? "Inativando…" : "Confirmar"}
            </button>
          </>
        }
      >
        <p>
          O cliente <strong>{client?.name}</strong> será marcado como removido e não aparecerá
          na lista de ativos. Histórico de agenda e comandas permanece no sistema.
        </p>
      </Modal>
    </>
  );
}

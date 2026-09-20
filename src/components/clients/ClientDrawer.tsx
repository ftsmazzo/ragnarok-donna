"use client";

import { useEffect, useState, useTransition } from "react";
import type { ClientDetail, ClientProfile } from "@/server/clients/queries";
import type { CatalogPackage } from "@/server/orders/types";
import {
  createClientAction,
  deactivateClientAction,
  reactivateClientAction,
  updateClientAction,
} from "@/app/(painel)/clientes/actions";
import { ClientProfilePanel, type ClientProfileTab } from "@/components/clients/ClientProfilePanel";
import { PersonAvatar } from "@/components/cadastro/PersonAvatar";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { formatDateTimeSp } from "@/lib/datetime";

type Mode = "new" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  client: ClientDetail | null;
  profile: ClientProfile | null;
  catalogPackages?: CatalogPackage[];
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function ClientDrawer({
  open,
  mode,
  client,
  profile,
  catalogPackages = [],
  onClose,
  onSaved,
}: Props) {
  const [error, setError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [tab, setTab] = useState<ClientProfileTab>("resumo");
  const [pending, startTransition] = useTransition();
  const [avatarUrl, setAvatarUrl] = useState("");

  const isEdit = mode === "edit" && client;
  const isRemoved = Boolean(
    isEdit && client && (client.deletedAt || !client.isActive)
  );

  useEffect(() => {
    if (!open) return;
    setAvatarUrl(client?.avatarUrl ?? "");
  }, [open, client?.id, client?.avatarUrl]);

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 450_000) {
      setError("Imagem muito grande (máx. ~450 KB)");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatarUrl(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

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

  const cadastroForm = (
    <>
      {isEdit ? (
        <div className="client-meta">
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
        <input type="hidden" name="avatarUrl" value={avatarUrl} />

        <div className="staff-photo-field">
          <PersonAvatar name={client?.name ?? "Novo"} src={avatarUrl} size={72} />
          <div className="staff-photo-actions">
            <label className="btn btn-outline btn-sm">
              {avatarUrl ? "Trocar foto" : "Enviar foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                disabled={isRemoved}
                onChange={handlePhotoFile}
              />
            </label>
            {avatarUrl ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={isRemoved}
                onClick={() => setAvatarUrl("")}
              >
                Remover
              </button>
            ) : null}
            <p className="client-profile-hint muted">
              JPG ou PNG, até 450 KB. Aparece na agenda. Ou cole um link https://.
            </p>
            <label className="form-field">
              <span>URL da foto (opcional)</span>
              <input
                type="url"
                placeholder="https://…"
                value={avatarUrl.startsWith("data:") ? "" : avatarUrl}
                disabled={isRemoved}
                onChange={(e) => setAvatarUrl(e.target.value.trim())}
              />
            </label>
          </div>
        </div>

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
          <span>Telefone / WhatsApp *</span>
          <input
            name="phone"
            type="tel"
            maxLength={32}
            required={!isEdit}
            defaultValue={client?.phone ?? ""}
            disabled={isRemoved}
            placeholder="(11) 98888-0000"
          />
        </label>

        <label className="form-field">
          <span>Por onde conheceu</span>
          <select
            name="howHeard"
            defaultValue={String(client?.preferences?.howHeard ?? "")}
            disabled={isRemoved}
          >
            <option value="">Selecione…</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="google">Google</option>
            <option value="indicacao">Indicação</option>
            <option value="passou_na_frente">Passou na frente / porta</option>
            <option value="parceiro">Parceiro</option>
            <option value="qr">QR code</option>
            <option value="site">Site</option>
            <option value="outro">Outro</option>
          </select>
        </label>

        <label className="form-field">
          <span>Campanha (se houver)</span>
          <input
            name="campaign"
            maxLength={120}
            defaultValue={String(client?.preferences?.campaign ?? "")}
            disabled={isRemoved}
            placeholder="Ex.: Primeiro corte, reel, anúncio…"
          />
        </label>

        <label className="form-field">
          <span>Se foi indicação, de quem?</span>
          <input
            name="referredBy"
            maxLength={160}
            defaultValue={String(client?.preferences?.referredBy ?? "")}
            disabled={isRemoved}
            placeholder="Nome de quem indicou"
          />
        </label>

        <label className="form-field">
          <span>Status CRM</span>
          <select
            name="crmStatus"
            defaultValue={String(client?.preferences?.crmStatus ?? (isEdit ? "client" : "client"))}
            disabled={isRemoved}
          >
            <option value="lead">Lead</option>
            <option value="client">Cliente</option>
            <option value="lapsed">Sumiu</option>
          </select>
        </label>

        <label className="form-field">
          <span>Etapa do funil</span>
          <select
            name="crmStage"
            defaultValue={String(client?.preferences?.crmStage ?? "")}
            disabled={isRemoved}
          >
            <option value="">—</option>
            <option value="interessado">Interessado</option>
            <option value="conversamos">Conversamos</option>
            <option value="qualificamos">Qualificamos</option>
            <option value="agendou">Agendou</option>
            <option value="veio">Veio</option>
            <option value="fez_servico">Fez o serviço</option>
            <option value="cliente">Cliente</option>
          </select>
        </label>

        <label className="form-field">
          <span>Saída do funil (se houver)</span>
          <select
            name="crmExit"
            defaultValue={String(client?.preferences?.crmExit ?? "")}
            disabled={isRemoved}
          >
            <option value="">Nenhuma</option>
            <option value="nao_respondeu">Não respondeu</option>
            <option value="nao_agendou">Não agendou</option>
            <option value="faltou">Faltou</option>
            <option value="perdeu">Perdeu</option>
          </select>
        </label>

        <label className="form-field">
          <span>Motivo da saída</span>
          <input
            name="crmExitReason"
            maxLength={200}
            defaultValue={String(client?.preferences?.crmExitReason ?? "")}
            disabled={isRemoved}
            placeholder="Preço, horário, concorrente…"
          />
        </label>

        <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            name="marketingOptIn"
            value="1"
            defaultChecked={client?.preferences?.marketingOptIn === true}
            disabled={isRemoved}
          />
          <span>Pode receber mensagem / follow-up</span>
        </label>

        <label className="form-field">
          <span>Preferência de corte</span>
          <input
            name="hairPreference"
            maxLength={120}
            defaultValue={String(client?.preferences?.hairPreference ?? "")}
            disabled={isRemoved}
            placeholder="Ex.: degradê médio, sem máquina zero…"
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
    </>
  );

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
              : "Ficha do cliente"
            : "Preencha os dados básicos"
        }
        width={isEdit ? 600 : 420}
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
                className={`btn btn-primary${pending ? " is-pending" : ""}`}
                disabled={pending}
                aria-busy={pending}
              >
                {pending ? "Salvando…" : tab === "cadastro" || !isEdit ? "Salvar" : "Salvar cadastro"}
              </button>
            ) : null}
          </>
        }
      >
        {error ? <div className="form-error">{error}</div> : null}

        {isEdit && profile ? (
          <ClientProfilePanel
            client={client}
            profile={profile}
            tab={tab}
            onTabChange={setTab}
            cadastroForm={cadastroForm}
            catalogPackages={catalogPackages}
            onPackagesChanged={() => onSaved(client.id)}
          />
        ) : (
          cadastroForm
        )}
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

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ClientDetail, ClientProfile } from "@/server/clients/queries";
import { renewOrTopUpClientPackageAction, postClientAccountAction, settleClientAccountDebtAction } from "@/app/(painel)/clientes/actions";
import {
  PackageSaleModal,
  type PackageSaleOption,
} from "@/components/pacotes/PackageSaleModal";
import { openOrderAction } from "@/app/(painel)/comandas/actions";
import { Modal } from "@/components/ui/Modal";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelApptStatus, labelOrderStatus, labelPaymentMethod, labelClientAccountReason } from "@/lib/format";
import {
  CRM_EXITS,
  labelCrmStatus,
  labelCrmStage,
  labelHowHeard,
  readCrmPreferences,
} from "@/lib/crm";

export type ClientProfileTab =
  | "resumo"
  | "cadastro"
  | "conta"
  | "pacotes"
  | "agenda"
  | "comandas"
  | "consumo";

type CatalogPackageOption = PackageSaleOption;

type Props = {
  client: ClientDetail;
  profile: ClientProfile;
  tab: ClientProfileTab;
  onTabChange: (tab: ClientProfileTab) => void;
  cadastroForm: React.ReactNode;
  catalogPackages?: CatalogPackageOption[];
  onPackagesChanged?: () => void;
};

const TABS: { id: ClientProfileTab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "cadastro", label: "Cadastro" },
  { id: "conta", label: "Conta" },
  { id: "pacotes", label: "Pacotes" },
  { id: "agenda", label: "Agenda" },
  { id: "comandas", label: "Comandas" },
  { id: "consumo", label: "Consumo" },
];

function packageStatusLabel(status: string) {
  if (status === "active") return "Ativo";
  if (status === "exhausted") return "Esgotado";
  if (status === "expired") return "Expirado";
  return status;
}

export function ClientProfilePanel({
  client,
  profile,
  tab,
  onTabChange,
  cadastroForm,
  catalogPackages = [],
  onPackagesChanged,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pkgError, setPkgError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [settleError, setSettleError] = useState("");
  const [saleOpen, setSaleOpen] = useState(false);
  const [confirmTopUpId, setConfirmTopUpId] = useState<string | null>(null);
  const {
    stats,
    recentAppointments,
    recentOrders,
    recentItems,
    topServices,
    packages = [],
    account = {
      clientId: client.id,
      balanceCents: client.accountBalanceCents ?? 0,
      ledger: [],
      ledgerTotal: 0,
      ledgerPage: 1,
      ledgerPageSize: 40,
    },
  } = profile;
  const prefEntries = Object.entries(client.preferences ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  const crm = readCrmPreferences(client.preferences);
  const activeCreditTotal = packages.reduce(
    (sum, p) =>
      sum +
      (p.status === "active"
        ? p.credits.reduce((s, c) => s + c.remainingQty, 0)
        : 0),
    0
  );

  function runPackageAction(
    clientPackageId: string,
    mode: "topup" | "renew"
  ) {
    setPkgError("");
    startTransition(async () => {
      const result = await renewOrTopUpClientPackageAction({
        clientPackageId,
        mode,
        clientId: client.id,
      });
      if (!result.ok) {
        setPkgError(result.error);
        return;
      }
      if (mode === "renew" && result.orderId) {
        router.push(`/comandas?id=${result.orderId}`);
        return;
      }
      onPackagesChanged?.();
      router.refresh();
    });
  }

  function openComanda() {
    setPkgError("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("clientId", client.id);
      const result = await openOrderAction(fd);
      if (!result.ok) {
        setPkgError(result.error ?? "Não foi possível abrir comanda");
        return;
      }
      router.push(`/comandas?id=${result.id}`);
    });
  }

  const salePackages: PackageSaleOption[] = catalogPackages.map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.priceCents,
    itemLabel: p.itemLabel ?? "",
    expiresAfterDays: p.expiresAfterDays ?? null,
  }));

  return (
    <>
      <nav className="drawer-tabs" aria-label="Seções da ficha">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "drawer-tab is-active" : "drawer-tab"}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
            {t.id === "conta" && account.balanceCents !== 0 ? (
              <span className="drawer-tab-badge">
                {account.balanceCents > 0 ? "+" : "−"}
              </span>
            ) : null}
            {t.id === "pacotes" && packages.length > 0 ? (
              <span className="drawer-tab-badge">{activeCreditTotal || packages.length}</span>
            ) : null}
            {t.id === "agenda" && stats.appointmentsTotal > 0 ? (
              <span className="drawer-tab-badge">{stats.appointmentsTotal}</span>
            ) : null}
            {t.id === "comandas" && stats.ordersTotal > 0 ? (
              <span className="drawer-tab-badge">{stats.ordersTotal}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "resumo" ? (
        <div className="client-profile-section">
          <div className="client-crm-banner">
            <div>
              <span className="meta-label">CRM</span>
              <strong>{labelCrmStatus(crm.crmStatus ?? (stats.ordersTotal > 0 || stats.appointmentsTotal > 0 ? "client" : "lead"))}</strong>
            </div>
            <div>
              <span className="meta-label">Origem</span>
              <strong>{labelHowHeard(crm.howHeard)}</strong>
              {crm.campaign ? <em className="muted"> · {crm.campaign}</em> : null}
              {crm.referredBy ? <em className="muted"> · indicação: {crm.referredBy}</em> : null}
            </div>
            {crm.crmStage ? (
              <div>
                <span className="meta-label">Funil</span>
                <strong>{labelCrmStage(crm.crmStage)}</strong>
              </div>
            ) : null}
            {crm.crmExit ? (
              <div>
                <span className="meta-label">Saída</span>
                <strong>
                  {CRM_EXITS.find((e) => e.value === crm.crmExit)?.label ?? crm.crmExit}
                </strong>
                {crm.crmExitReason ? (
                  <em className="muted"> · {crm.crmExitReason}</em>
                ) : null}
              </div>
            ) : null}
            {crm.leadSource === "whatsapp_inbound" ? (
              <p className="client-profile-hint">Lead criado no 1º contato WhatsApp.</p>
            ) : null}
            {Array.isArray(client.preferences?.crmStageHistory) &&
            (client.preferences.crmStageHistory as unknown[]).length > 0 ? (
              <details className="client-profile-hint">
                <summary>Histórico do funil</summary>
                <ul className="crm-stage-history">
                  {[...(client.preferences.crmStageHistory as { stage?: string; at?: string; by?: string }[])]
                    .slice(-8)
                    .reverse()
                    .map((h, i) => (
                      <li key={`${h.at ?? i}-${h.stage ?? ""}`}>
                        {labelCrmStage(h.stage)} · {h.at ? formatDateTimeSp(new Date(h.at)) : "—"}
                        {h.by ? ` · ${h.by}` : ""}
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}
          </div>
          <div className="client-stats">
            <div className="client-stat">
              <span className="meta-label">Agendamentos</span>
              <strong>{stats.appointmentsTotal.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Comandas</span>
              <strong>{stats.ordersTotal.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Total consumido</span>
              <strong>{formatMoney(stats.totalSpentCents)}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Conta do cliente</span>
              <strong
                style={{
                  color:
                    account.balanceCents > 0
                      ? "var(--success, #2e7d32)"
                      : account.balanceCents < 0
                        ? "var(--danger, #c62828)"
                        : undefined,
                }}
              >
                {formatMoney(account.balanceCents)}
                {account.balanceCents > 0
                  ? " crédito"
                  : account.balanceCents < 0
                    ? " débito"
                    : ""}
              </strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Créditos pacote</span>
              <strong>{activeCreditTotal.toLocaleString("pt-BR")}</strong>
            </div>
          </div>

          {stats.lastVisitAt ? (
            <p className="client-profile-hint">
              Último agendamento: <strong>{formatDateTimeSp(stats.lastVisitAt)}</strong>
            </p>
          ) : stats.ordersTotal > 0 ? (
            <p className="client-profile-hint">
              Sem agendamentos vinculados, mas há {stats.ordersTotal.toLocaleString("pt-BR")}{" "}
              comanda(s) no histórico.
            </p>
          ) : (
            <p className="client-profile-hint">
              Nenhum histórico vinculado a este cadastro ainda.
            </p>
          )}

          {stats.waitlistTotal > 0 ? (
            <p className="client-profile-hint">
              Lista de espera: <strong>{stats.waitlistTotal}</strong> registro(s).
            </p>
          ) : null}

          {packages.length > 0 ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Pacotes</h3>
              <ul className="client-top-list">
                {packages.slice(0, 3).map((p) => (
                  <li key={p.clientPackageId}>
                    <span>
                      {p.packageName} · {packageStatusLabel(p.status)}
                    </span>
                    <span>
                      {p.credits.reduce((s, c) => s + c.remainingQty, 0)}/
                      {p.credits.reduce((s, c) => s + c.totalQty, 0)} créd.
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onTabChange("pacotes")}
              >
                Ver carteira
              </button>
            </div>
          ) : null}

          {topServices.length > 0 ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Serviços mais frequentes</h3>
              <ul className="client-top-list">
                {topServices.map((s) => (
                  <li key={s.description}>
                    <span>{s.description}</span>
                    <span>
                      {s.count}x · {formatMoney(s.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {client.notes ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Observações</h3>
              <p className="client-profile-text">{client.notes}</p>
            </div>
          ) : null}

          {client.tags.length > 0 ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Tags</h3>
              <div className="client-tag-list">
                {client.tags.map((tag) => (
                  <span key={tag} className="client-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {prefEntries.length > 0 ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Preferências</h3>
              <dl className="client-pref-list">
                {prefEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "cadastro" ? cadastroForm : null}

      {tab === "conta" ? (
        <div className="client-profile-section">
          <div className="client-stats">
            <div className="client-stat">
              <span className="meta-label">Saldo atual</span>
              <strong
                style={{
                  color:
                    account.balanceCents > 0
                      ? "var(--success, #2e7d32)"
                      : account.balanceCents < 0
                        ? "var(--danger, #c62828)"
                        : undefined,
                }}
              >
                {formatMoney(account.balanceCents)}
              </strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Situação</span>
              <strong>
                {account.balanceCents > 0
                  ? "Crédito (a favor do cliente)"
                  : account.balanceCents < 0
                    ? "Débito / fiado"
                    : "Zerada"}
              </strong>
            </div>
          </div>

          <p className="client-profile-hint muted">
            Positivo = crédito pré-pago para usar na comanda. Negativo = cliente deve à loja.
          </p>

          {account.balanceCents < 0 ? (
            <div className="client-profile-block" style={{ marginTop: 12 }}>
              <h3 className="section-title">Receber fiado</h3>
              {settleError ? <p className="form-error">{settleError}</p> : null}
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const fd = new FormData(form);
                  fd.set("clientId", client.id);
                  setSettleError("");
                  startTransition(async () => {
                    const result = await settleClientAccountDebtAction(fd);
                    if (!result.ok) {
                      setSettleError(result.error);
                      return;
                    }
                    form.reset();
                    router.refresh();
                  });
                }}
              >
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Valor (R$) *</span>
                    <input
                      name="amountReais"
                      type="number"
                      min={0.01}
                      step={0.01}
                      max={Math.abs(account.balanceCents) / 100}
                      defaultValue={(Math.abs(account.balanceCents) / 100).toFixed(2)}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Forma *</span>
                    <select name="method" defaultValue="pix" required>
                      <option value="pix">PIX</option>
                      <option value="cash">Dinheiro</option>
                      <option value="debit">Débito</option>
                      <option value="credit">Crédito</option>
                      <option value="transfer">Transferência</option>
                      <option value="other">Outro</option>
                    </select>
                  </label>
                </div>
                <label className="form-field">
                  <span>Observação</span>
                  <input name="notes" type="text" maxLength={240} placeholder="Opcional" />
                </label>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? "…" : "Receber e lançar no caixa"}
                </button>
              </form>
            </div>
          ) : null}

          {accountError ? <p className="form-error">{accountError}</p> : null}

          <form
            className="form-stack"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              fd.set("clientId", client.id);
              setAccountError("");
              startTransition(async () => {
                const result = await postClientAccountAction(fd);
                if (!result.ok) {
                  setAccountError(result.error);
                  return;
                }
                form.reset();
                router.refresh();
              });
            }}
          >
            <div className="form-row-2">
              <label className="form-field">
                <span>Lançamento manual</span>
                <select name="kind" defaultValue="credit" required>
                  <option value="credit">+ Crédito</option>
                  <option value="debit">+ Débito</option>
                </select>
              </label>
              <label className="form-field">
                <span>Valor (R$) *</span>
                <input
                  name="amountReais"
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  placeholder="0,00"
                />
              </label>
            </div>
            <label className="form-field">
              <span>Observação</span>
              <input name="notes" type="text" maxLength={240} placeholder="Opcional" />
            </label>
            <button type="submit" className="btn btn-outline" disabled={pending}>
              {pending ? "…" : "Lançar na conta"}
            </button>
          </form>

          <div className="client-profile-block" style={{ marginTop: 20 }}>
            <h3 className="section-title">Extrato</h3>
            {account.ledger.length === 0 ? (
              <p className="client-profile-hint muted">Nenhuma movimentação ainda.</p>
            ) : (
              <>
                <ul className="order-wallet-list">
                  {account.ledger.map((entry) => (
                    <li key={entry.id} className="order-wallet-group">
                      <div className="order-wallet-group-head">
                        <strong>
                          {entry.deltaCents > 0 ? "+" : ""}
                          {formatMoney(entry.deltaCents)}
                        </strong>
                        <span className="meta-label">
                          saldo {formatMoney(entry.balanceAfterCents)}
                        </span>
                      </div>
                      <p className="client-profile-hint" style={{ margin: 0 }}>
                        {labelClientAccountReason(entry.reason)}
                        {entry.notes ? ` — ${entry.notes}` : ""}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span className="meta-label">{formatDateTimeSp(entry.createdAt)}</span>
                        {entry.orderId ? (
                          <a
                            className="btn btn-ghost btn-sm"
                            href={`/comandas?id=${entry.orderId}`}
                          >
                            Ver comanda
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {account.ledgerTotal > account.ledgerPageSize ? (
                  <div
                    className="panel-footer"
                    style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}
                  >
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={account.ledgerPage <= 1 || pending}
                      onClick={() => {
                        const sp = new URLSearchParams(window.location.search);
                        sp.set("id", client.id);
                        sp.set("ledgerPage", String(Math.max(1, account.ledgerPage - 1)));
                        router.push(`/clientes?${sp.toString()}`);
                      }}
                    >
                      Anterior
                    </button>
                    <span className="meta-label" style={{ alignSelf: "center" }}>
                      {account.ledgerPage}/
                      {Math.max(1, Math.ceil(account.ledgerTotal / account.ledgerPageSize))}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={
                        account.ledgerPage * account.ledgerPageSize >= account.ledgerTotal ||
                        pending
                      }
                      onClick={() => {
                        const sp = new URLSearchParams(window.location.search);
                        sp.set("id", client.id);
                        sp.set("ledgerPage", String(account.ledgerPage + 1));
                        router.push(`/clientes?${sp.toString()}`);
                      }}
                    >
                      Próxima
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === "pacotes" ? (
        <div className="client-profile-section">
          {pkgError ? <div className="form-error">{pkgError}</div> : null}
          {salePackages.length > 0 ? (
            <div className="catalog-package-line" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={() => setSaleOpen(true)}
              >
                Vender pacote
              </button>
            </div>
          ) : null}
          <div className="order-wallet-head" style={{ marginBottom: 12 }}>
            <strong>Carteira de pacotes</strong>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={openComanda}
            >
              Abrir comanda
            </button>
          </div>
          {packages.length === 0 ? (
            <p className="client-profile-empty">
              Nenhum pacote vendido. Venda um pacote na comanda para gerar a carteira.
            </p>
          ) : (
            <ul className="client-package-list">
              {packages.map((p) => {
                const remaining = p.credits.reduce((s, c) => s + c.remainingQty, 0);
                const total = p.credits.reduce((s, c) => s + c.totalQty, 0);
                return (
                  <li key={p.clientPackageId} className="client-package-card">
                    <div className="client-package-card-head">
                      <div>
                        <strong>{p.packageName}</strong>
                        <span className="muted">
                          {packageStatusLabel(p.status)} · comprado{" "}
                          {formatDateTimeSp(p.purchasedAt).slice(0, 10)}
                          {p.expiresAt
                            ? ` · vale até ${formatDateTimeSp(p.expiresAt).slice(0, 10)}`
                            : ""}
                        </span>
                      </div>
                      <em>
                        {remaining}/{total} créd.
                      </em>
                    </div>
                    <ul className="order-wallet-list">
                      {p.credits.map((c) => (
                        <li key={c.creditId}>
                          <div>
                            <strong>{c.serviceName ?? c.productName ?? "Item"}</strong>
                            <span className="muted">
                              {c.productId ? "Produto" : "Serviço"}
                            </span>
                          </div>
                          <em>
                            {c.remainingQty} rest. de {c.totalQty}
                          </em>
                        </li>
                      ))}
                    </ul>
                    {p.recentRedemptions.length > 0 ? (
                      <div className="client-package-uses">
                        <span className="meta-label">Últimos usos</span>
                        <ul>
                          {p.recentRedemptions.map((u) => (
                            <li key={u.orderItemId}>
                              {u.description}
                              {u.performedAt
                                ? ` · ${formatDateTimeSp(u.performedAt).slice(0, 16)}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="client-package-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={pending}
                        onClick={() => setConfirmTopUpId(p.clientPackageId)}
                      >
                        Repor créditos
                      </button>
                      {p.packageId ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pending}
                          onClick={() => runPackageAction(p.clientPackageId, "renew")}
                        >
                          Renovar (nova venda)
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "agenda" ? (
        <div className="client-profile-section">
          {recentAppointments.length === 0 ? (
            <p className="client-profile-empty">Nenhum agendamento no histórico.</p>
          ) : (
            <ul className="client-timeline">
              {recentAppointments.map((a) => (
                <li key={a.id} className="client-timeline-item">
                  <div className="client-timeline-main">
                    <strong>{formatDateTimeSp(a.startsAt)}</strong>
                    <span>{a.serviceName ?? "Serviço não informado"}</span>
                  </div>
                  <div className="client-timeline-meta">
                    <span>{labelApptStatus(a.status)}</span>
                    {a.staffName ? <span>{a.staffName}</span> : null}
                    {a.priceCents != null ? <span>{formatMoney(a.priceCents)}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {stats.appointmentsTotal > recentAppointments.length ? (
            <p className="client-profile-hint">
              Mostrando os {recentAppointments.length} mais recentes de{" "}
              {stats.appointmentsTotal.toLocaleString("pt-BR")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "comandas" ? (
        <div className="client-profile-section">
          {recentOrders.length === 0 ? (
            <p className="client-profile-empty">Nenhuma comanda vinculada a este cliente.</p>
          ) : (
            <ul className="client-timeline">
              {recentOrders.map((o) => (
                <li key={o.id} className="client-timeline-item">
                  <div className="client-timeline-main">
                    <strong>
                      {o.externalId ? `Comanda #${o.externalId}` : formatDateTimeSp(o.openedAt)}
                    </strong>
                    <span>{formatDateTimeSp(o.openedAt)}</span>
                  </div>
                  <div className="client-timeline-meta">
                    <span>{labelOrderStatus(o.status)}</span>
                    <span>
                      {o.itemCount} item(ns) · {formatMoney(o.totalCents)}
                    </span>
                    {o.paymentMethod ? (
                      <span>{labelPaymentMethod(o.paymentMethod)}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {stats.ordersTotal > recentOrders.length ? (
            <p className="client-profile-hint">
              Mostrando as {recentOrders.length} mais recentes de{" "}
              {stats.ordersTotal.toLocaleString("pt-BR")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "consumo" ? (
        <div className="client-profile-section">
          {recentItems.length === 0 ? (
            <p className="client-profile-empty">Nenhum item de consumo registrado.</p>
          ) : (
            <ul className="client-timeline">
              {recentItems.map((item) => (
                <li key={item.id} className="client-timeline-item">
                  <div className="client-timeline-main">
                    <strong>{item.description}</strong>
                    <span>
                      {item.performedAt
                        ? formatDateTimeSp(item.performedAt)
                        : item.orderExternalId
                          ? `Comanda #${item.orderExternalId}`
                          : "—"}
                    </span>
                  </div>
                  <div className="client-timeline-meta">
                    <span>{item.itemType === "service" ? "Serviço" : "Produto"}</span>
                    {item.staffName ? <span>{item.staffName}</span> : null}
                    <span>{formatMoney(item.totalCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Modal
        open={confirmTopUpId != null}
        onClose={() => setConfirmTopUpId(null)}
        title="Repor créditos"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmTopUpId(null)}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !confirmTopUpId}
              onClick={() => {
                const id = confirmTopUpId;
                if (!id) return;
                setConfirmTopUpId(null);
                runPackageAction(id, "topup");
              }}
            >
              Confirmar reposição
            </button>
          </>
        }
      >
        <p className="client-profile-hint">
          Os créditos deste pacote serão repostos conforme o template, sem cobrança na comanda.
        </p>
      </Modal>

      <PackageSaleModal
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        packages={salePackages}
        initialClientId={client.id}
        initialClientName={client.name}
        onSuccess={() => {
          onPackagesChanged?.();
          router.refresh();
        }}
      />
    </>
  );
}

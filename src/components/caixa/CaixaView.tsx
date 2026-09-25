"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { Modal } from "@/components/ui/Modal";
import type { CashDaySnapshot, CashPermissions } from "@/server/finance/types";
import { formatDateLabelSp, formatDateTimeSp, shiftDateSp, todaySp } from "@/lib/datetime";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import {
  addCashMovementAction,
  closeCashSessionAction,
  deleteCashDayPaymentAction,
  deleteCashMovementAction,
  openCashSessionAction,
} from "@/app/(painel)/caixa/actions";
import { CommissionAdvancePanel } from "@/components/comissoes/CommissionAdvancePanel";
import { useToast } from "@/components/ui/Toast";

type Props = {
  data: CashDaySnapshot;
  permissions: CashPermissions;
  staffList: { id: string; name: string }[];
};

export function CaixaView({ data, permissions, staffList }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const prev = shiftDateSp(data.date, -1);
  const next = shiftDateSp(data.date, 1);
  const isToday = data.date === todaySp();
  const openSession = data.openSession;
  const canWrite = permissions.canWrite && isToday;

  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [moveModal, setMoveModal] = useState<"in" | "out" | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  function cancelPackagePayment(paymentId: string, amountCents: number) {
    if (
      !window.confirm(
        `Excluir esta venda de pacote de ${formatMoney(amountCents)}?\nO valor some do Caixa do dia.`
      )
    ) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await deleteCashDayPaymentAction({
        paymentId,
        packageCancel: true,
      });
      if (!result.ok) {
        setError(result.error ?? "Erro");
        showToast(result.error ?? "Erro", "error");
        return;
      }
      const refunded = result.refundedCents ?? amountCents;
      showToast(`Pacote excluído · ${formatMoney(refunded)} saiu do caixa`, "success");
      refresh();
    });
  }

  function deletePaymentRow(p: {
    id: string;
    amountCents: number;
    method: string;
    clientName: string | null;
    packageCancelId: string | null;
    isStaffConsumption: boolean;
  }) {
    if (p.packageCancelId) {
      cancelPackagePayment(p.id, p.amountCents);
      return;
    }
    const who = p.clientName ? ` · ${p.clientName}` : "";
    const tip = p.isStaffConsumption
      ? "\n(Consumo profissional — some do detalhe e do caixa se houver movimento.)"
      : "\nRemove o pagamento da comanda e o movimento no caixa (se existir).";
    if (
      !window.confirm(
        `Excluir este pagamento?\n${p.method}${who} · ${formatMoney(p.amountCents)}${tip}`
      )
    ) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await deleteCashDayPaymentAction({ paymentId: p.id });
      if (!result.ok) {
        setError(result.error ?? "Erro ao excluir");
        showToast(result.error ?? "Erro ao excluir", "error");
        return;
      }
      showToast("Pagamento excluído", "success");
      refresh();
    });
  }

  function deleteMovement(m: {
    id: string;
    amountCents: number;
    direction: "in" | "out";
    description: string | null;
  }) {
    const label = m.description?.trim() || (m.direction === "out" ? "Saída" : "Entrada");
    if (
      !window.confirm(
        `Excluir este movimento?\n${label} · ${m.direction === "out" ? "−" : "+"}${formatMoney(m.amountCents)}\nO saldo esperado do caixa é recalculado.`
      )
    ) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await deleteCashMovementAction(m.id);
      if (!result.ok) {
        setError(result.error ?? "Erro ao excluir");
        showToast(result.error ?? "Erro ao excluir", "error");
        return;
      }
      showToast("Movimento excluído do caixa", "success");
      refresh();
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError("");
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Erro");
        return;
      }
      onOk?.();
      refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Caixa"
        subtitle={formatDateLabelSp(data.date)}
        actions={
          <>
            <Link
              href={`/caixa?date=${todaySp()}`}
              className={`btn btn-outline${isToday ? " is-active-tab" : ""}`}
            >
              Hoje
            </Link>
            <Link href="/caixa/historico" className="btn btn-outline">
              Histórico
            </Link>
            <Link href={`/caixa?date=${prev}`} className="btn btn-outline">
              ← Anterior
            </Link>
            <Link href={`/caixa?date=${next}`} className="btn btn-outline">
              Próximo →
            </Link>
            {canWrite && !openSession ? (
              <button type="button" className="btn btn-primary" onClick={() => setOpenModal(true)}>
                Abrir caixa
              </button>
            ) : null}
            {canWrite && openSession ? (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setMoveModal("in")}>
                  Suprimento
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setMoveModal("out")}>
                  Sangria
                </button>
                {staffList.length > 0 ? (
                  <CommissionAdvancePanel staffList={staffList} buttonLabel="Vale" />
                ) : null}
                <button type="button" className="btn btn-primary" onClick={() => setCloseModal(true)}>
                  Fechar caixa
                </button>
              </>
            ) : null}
          </>
        }
      />

      {error ? <div className="form-error banner-inline">{error}</div> : null}

      {openSession ? (
        <div className="info-banner">
          Caixa <strong>aberto</strong> desde {formatDateTimeSp(openSession.openedAt)}
          {openSession.openedByName ? ` · ${openSession.openedByName}` : ""} · fundo{" "}
          {formatMoney(openSession.openingCents)} · saldo esperado{" "}
          {formatMoney(data.expectedBalanceCents)}
        </div>
      ) : data.session && !data.session.isOpen ? (
        <div className="info-banner">
          Sessão do dia fechada em{" "}
          {data.session.closedAt ? formatDateTimeSp(data.session.closedAt) : "—"} · contagem{" "}
          {formatMoney(data.session.closingCents)}
        </div>
      ) : (
        <div className="info-banner">
          Nenhum caixa aberto. Pagamentos de comandas continuam sendo registrados; com o caixa
          aberto eles entram na sessão (como no Barber).
        </div>
      )}

      <SummaryCards
        cards={[
          {
            label: "Saldo esperado (sessão)",
            value: formatMoney(data.expectedBalanceCents),
            hint: openSession || data.session ? "fundo + entradas − saídas" : "sem sessão",
          },
          {
            label: "Pagamentos do dia",
            value: formatMoney(data.paymentTotalCents),
            subline:
              data.paymentFeeCents > 0
                ? `Líquido após taxa %: ${formatMoney(data.paymentNetCents)}`
                : undefined,
            hint:
              data.paymentFeeCents > 0
                ? `${data.paymentCount} pag. · taxas maquininha ${formatMoney(data.paymentFeeCents)} (só informativo — não altera comanda)`
                : `${data.paymentCount} pagamento(s)`,
          },
          {
            label: "Comandas fechadas",
            value: data.closedOrdersCount,
            hint: formatMoney(data.closedOrdersCents),
          },
          {
            label: "Comandas abertas",
            value: data.openOrdersCount,
            hint: "em aberto agora",
          },
        ]}
      />

      <div className="caixa-layout">
        <section className="panel">
          <div className="panel-toolbar">
            <strong>Movimentos da sessão</strong>
            {canWrite && openSession ? (
              <span className="muted-note">🗑 na linha remove do saldo esperado</span>
            ) : null}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Nenhum movimento na sessão.
                    </td>
                  </tr>
                ) : (
                  data.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateTimeSp(m.createdAt)}</td>
                      <td>{m.direction === "in" ? "Entrada" : "Saída"}</td>
                      <td>
                        {m.description ?? "—"}
                        {m.clientName ? ` · ${m.clientName}` : ""}
                        {m.orderExternalId ? ` · #${m.orderExternalId}` : ""}
                      </td>
                      <td>
                        {m.direction === "in" &&
                        m.description &&
                        m.description !== "Pagamento de comanda" &&
                        !m.description.includes("Consumo profissional")
                          ? m.description
                          : m.method
                            ? labelPaymentMethod(m.method)
                            : "—"}
                      </td>
                      <td className={m.direction === "out" ? "cell-danger" : undefined}>
                        {m.direction === "out" ? "−" : "+"}
                        {formatMoney(m.amountCents)}
                      </td>
                      <td>
                        {canWrite && openSession ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={pending}
                            title="Excluir movimento do caixa"
                            aria-label="Excluir movimento"
                            onClick={() => deleteMovement(m)}
                          >
                            🗑
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-toolbar">
            <strong>Pagamentos do dia (todas as formas)</strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Forma</th>
                  <th>Qtd</th>
                  <th>Total</th>
                  <th>Taxa %</th>
                  <th>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {data.byMethod.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      Nenhum pagamento neste dia.
                    </td>
                  </tr>
                ) : (
                  data.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td className="cell-strong">{m.method}</td>
                      <td>{m.count}</td>
                      <td>{formatMoney(m.totalCents)}</td>
                      <td>
                        {m.feeCents > 0 && m.totalCents > 0
                          ? `${((m.feeCents / m.totalCents) * 100).toFixed(2).replace(".", ",")}% · ${formatMoney(m.feeCents)}`
                          : m.feeCents > 0
                            ? formatMoney(m.feeCents)
                            : "—"}
                      </td>
                      <td>{formatMoney(m.netCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="panel-toolbar" style={{ marginTop: 12 }}>
            <strong>Detalhe dos pagamentos</strong>
            <span className="muted-note">
              🗑 remove o lançamento · pacote sem uso cancela a venda
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Comanda</th>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Nenhuma movimentação.
                    </td>
                  </tr>
                ) : (
                  data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateTimeSp(p.paidAt)}</td>
                      <td>
                        {p.clientName ?? "—"}
                        {p.isStaffConsumption ? (
                          <span className="order-badge" style={{ marginLeft: 6 }}>
                            Consumo
                          </span>
                        ) : null}
                      </td>
                      <td>{p.orderExternalId ?? "—"}</td>
                      <td>{labelPaymentMethod(p.method)}</td>
                      <td>{formatMoney(p.amountCents)}</td>
                      <td>
                        {permissions.canWrite ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={pending}
                            title={
                              p.packageCancelId
                                ? "Excluir venda de pacote e estornar"
                                : "Excluir pagamento"
                            }
                            aria-label={
                              p.packageCancelId
                                ? "Excluir venda de pacote"
                                : "Excluir pagamento"
                            }
                            onClick={() => deletePaymentRow(p)}
                          >
                            🗑
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Abrir caixa"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpenModal(false)}>
              Cancelar
            </button>
            <button type="submit" form="open-cash-form" className="btn btn-primary" disabled={pending}>
              {pending ? "…" : "Abrir"}
            </button>
          </>
        }
      >
        <form
          id="open-cash-form"
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => openCashSessionAction(fd), () => setOpenModal(false));
          }}
        >
          <label className="form-field">
            <span>Fundo de troco (R$)</span>
            <input name="openingReais" type="number" min={0} step={0.01} defaultValue={0} />
          </label>
          <label className="form-field">
            <span>Observações</span>
            <textarea name="notes" rows={2} />
          </label>
        </form>
      </Modal>

      <Modal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        title="Fechar caixa"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setCloseModal(false)}>
              Cancelar
            </button>
            <button type="submit" form="close-cash-form" className="btn btn-primary" disabled={pending}>
              {pending ? "…" : "Fechar"}
            </button>
          </>
        }
      >
        <p className="client-profile-hint">
          Saldo esperado: <strong>{formatMoney(data.expectedBalanceCents)}</strong>
        </p>
        <form
          id="close-cash-form"
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => closeCashSessionAction(fd), () => setCloseModal(false));
          }}
        >
          <label className="form-field">
            <span>Contagem em caixa (R$) *</span>
            <input
              name="closingReais"
              type="number"
              min={0}
              step={0.01}
              required
              defaultValue={(data.expectedBalanceCents / 100).toFixed(2)}
            />
          </label>
          <label className="form-field">
            <span>Observações</span>
            <textarea name="notes" rows={2} />
          </label>
        </form>
      </Modal>

      <Modal
        open={moveModal !== null}
        onClose={() => setMoveModal(null)}
        title={moveModal === "out" ? "Sangria" : "Suprimento"}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setMoveModal(null)}>
              Cancelar
            </button>
            <button type="submit" form="move-cash-form" className="btn btn-primary" disabled={pending}>
              Confirmar
            </button>
          </>
        }
      >
        {moveModal ? (
          <form
            id="move-cash-form"
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("direction", moveModal);
              run(() => addCashMovementAction(fd), () => setMoveModal(null));
            }}
          >
            <input type="hidden" name="direction" value={moveModal} />
            <label className="form-field">
              <span>Valor (R$) *</span>
              <input name="amountReais" type="number" min={0.01} step={0.01} required />
            </label>
            {moveModal === "in" ? (
              <label className="form-field">
                <span>Forma</span>
                <select name="method" defaultValue="cash">
                  <option value="cash">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="other">Outro</option>
                </select>
              </label>
            ) : null}
            <label className="form-field">
              <span>Descrição</span>
              <input
                name="description"
                defaultValue={moveModal === "out" ? "Sangria" : "Suprimento"}
              />
            </label>
          </form>
        ) : null}
      </Modal>
    </>
  );
}

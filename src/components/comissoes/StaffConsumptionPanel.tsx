"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/format";
import { staffConsumptionAmountCents } from "@/lib/staff-consumption";
import { registerStaffConsumptionAction } from "@/app/(painel)/comissoes/actions";

type StaffOpt = { id: string; name: string };
type ProductOpt = { id: string; name: string; priceCents: number; stockQty: number };

type Props = {
  staffList: StaffOpt[];
  products: ProductOpt[];
  defaultStaffId?: string;
};

export function StaffConsumptionPanel({ staffList, products, defaultStaffId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();

  const inStock = useMemo(() => products.filter((p) => p.stockQty > 0), [products]);
  const selected = inStock.find((p) => p.id === productId);
  const previewCents = selected
    ? staffConsumptionAmountCents(selected.priceCents, qty)
    : null;

  function submit(formData: FormData) {
    setError("");
    setOkMsg("");
    startTransition(async () => {
      const result = await registerStaffConsumptionAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Erro");
        return;
      }
      setOkMsg(
        result.amountCents != null
          ? `Consumo registrado · ${formatMoney(result.amountCents)} na comissão`
          : "Consumo registrado"
      );
      setProductId("");
      setQty(1);
      router.refresh();
      window.setTimeout(() => {
        setOpen(false);
        setOkMsg("");
      }, 1200);
    });
  }

  return (
    <>
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        Consumo do barbeiro
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Consumo do barbeiro">
        <form action={submit} className="form-stack">
          {error ? <div className="form-error">{error}</div> : null}
          {okMsg ? (
            <div className="form-error" style={{ background: "#ecfdf5", color: "#166534", borderColor: "#a7f3d0" }}>
              {okMsg}
            </div>
          ) : null}
          <p className="client-profile-hint muted">
            Baixa estoque e desconta 70% do preço na comissão (venda −30%). Não vai para a
            comanda do cliente.
          </p>
          <label className="filter-field">
            <span>Profissional *</span>
            <select
              name="staffId"
              required
              defaultValue={defaultStaffId ?? ""}
              className="search-input"
            >
              <option value="" disabled>
                Selecione
              </option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Produto *</span>
            <select
              name="productId"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="search-input"
            >
              <option value="" disabled>
                Selecione
              </option>
              {inStock.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatMoney(p.priceCents)} · est. {p.stockQty}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Quantidade</span>
            <input
              name="qty"
              type="number"
              min={1}
              max={selected ? Math.min(99, selected.stockQty) : 99}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="search-input"
            />
          </label>
          {previewCents != null ? (
            <p className="client-profile-hint">
              Desconto na comissão: <strong>{formatMoney(previewCents)}</strong>
            </p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || inStock.length === 0}
            >
              {pending ? "Salvando…" : "Registrar consumo"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

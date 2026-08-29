"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/Drawer";
import {
  createPackageAction,
  createProductAction,
  createServiceAction,
  updatePackageAction,
  updateProductAction,
  updateServiceAction,
} from "@/app/(painel)/cadastros/actions";

type Kind = "product" | "service" | "package";

type ProductDefaults = {
  id?: string;
  name?: string;
  category?: string | null;
  brand?: string | null;
  sku?: string | null;
  priceCents?: number;
  stockQty?: number;
  minQty?: number;
  forSale?: boolean;
};

type ServiceDefaults = {
  id?: string;
  name?: string;
  durationMin?: number;
  priceCents?: number;
  commissionBps?: number | null;
  bookableOnline?: boolean;
};

type PackageDefaults = {
  id?: string;
  name?: string;
  description?: string | null;
  priceCents?: number;
  bookableOnline?: boolean;
};

type Props = {
  kind: Kind;
  open: boolean;
  onClose: () => void;
  product?: ProductDefaults | null;
  service?: ServiceDefaults | null;
  pkg?: PackageDefaults | null;
};

function centsToPrice(cents?: number) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export function CatalogDrawer({ kind, open, onClose, product, service, pkg }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const isEdit =
    (kind === "product" && product?.id) ||
    (kind === "service" && service?.id) ||
    (kind === "package" && pkg?.id);

  const title =
    kind === "product"
      ? isEdit
        ? "Editar produto"
        : "Novo produto"
      : kind === "service"
        ? isEdit
          ? "Editar serviço"
          : "Novo serviço"
        : isEdit
          ? "Editar pacote"
          : "Novo pacote";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      let result;
      if (kind === "product") {
        result = product?.id
          ? await updateProductAction(product.id, formData)
          : await createProductAction(formData);
      } else if (kind === "service") {
        result = service?.id
          ? await updateServiceAction(service.id, formData)
          : await createServiceAction(formData);
      } else {
        result = pkg?.id
          ? await updatePackageAction(pkg.id, formData)
          : await createPackageAction(formData);
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Catálogo operacional"
      width={420}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" form="catalog-form" className="btn btn-primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <form id="catalog-form" className="form-stack" onSubmit={handleSubmit}>
        {kind === "product" ? (
          <>
            <label className="form-field">
              <span>Nome *</span>
              <input name="name" required defaultValue={product?.name ?? ""} autoFocus />
            </label>
            <div className="form-row-2">
              <label className="form-field">
                <span>Categoria</span>
                <input name="category" defaultValue={product?.category ?? ""} />
              </label>
              <label className="form-field">
                <span>Marca</span>
                <input name="brand" defaultValue={product?.brand ?? ""} />
              </label>
            </div>
            <label className="form-field">
              <span>SKU</span>
              <input name="sku" defaultValue={product?.sku ?? ""} />
            </label>
            <div className="form-row-2">
              <label className="form-field">
                <span>Preço (R$) *</span>
                <input
                  name="price"
                  required
                  inputMode="decimal"
                  defaultValue={centsToPrice(product?.priceCents)}
                />
              </label>
              <label className="form-field">
                <span>Estoque</span>
                <input
                  name="stockQty"
                  type="number"
                  min={0}
                  defaultValue={product?.stockQty ?? 0}
                />
              </label>
            </div>
            <label className="form-field">
              <span>Estoque mínimo</span>
              <input name="minQty" type="number" min={0} defaultValue={product?.minQty ?? 0} />
            </label>
            <label className="form-check">
              <input
                name="forSale"
                type="checkbox"
                defaultChecked={product?.forSale ?? true}
              />
              <span>Disponível para venda</span>
            </label>
          </>
        ) : null}

        {kind === "service" ? (
          <>
            <label className="form-field">
              <span>Nome *</span>
              <input name="name" required defaultValue={service?.name ?? ""} autoFocus />
            </label>
            <div className="form-row-2">
              <label className="form-field">
                <span>Duração (min)</span>
                <input
                  name="durationMin"
                  type="number"
                  min={5}
                  defaultValue={service?.durationMin ?? 30}
                />
              </label>
              <label className="form-field">
                <span>Preço (R$) *</span>
                <input
                  name="price"
                  required
                  inputMode="decimal"
                  defaultValue={centsToPrice(service?.priceCents)}
                />
              </label>
            </div>
            <label className="form-field">
              <span>Comissão (%)</span>
              <input
                name="commissionPct"
                type="number"
                min={0}
                max={100}
                step={0.01}
                defaultValue={
                  service?.commissionBps != null ? String(service.commissionBps / 100) : ""
                }
              />
            </label>
            <label className="form-check">
              <input
                name="bookableOnline"
                type="checkbox"
                defaultChecked={service?.bookableOnline ?? true}
              />
              <span>Agendável online</span>
            </label>
          </>
        ) : null}

        {kind === "package" ? (
          <>
            <label className="form-field">
              <span>Nome *</span>
              <input name="name" required defaultValue={pkg?.name ?? ""} autoFocus />
            </label>
            <label className="form-field">
              <span>Descrição</span>
              <textarea name="description" rows={3} defaultValue={pkg?.description ?? ""} />
            </label>
            <label className="form-field">
              <span>Preço (R$) *</span>
              <input
                name="price"
                required
                inputMode="decimal"
                defaultValue={centsToPrice(pkg?.priceCents)}
              />
            </label>
            <label className="form-check">
              <input
                name="bookableOnline"
                type="checkbox"
                defaultChecked={pkg?.bookableOnline ?? true}
              />
              <span>Agendável online</span>
            </label>
          </>
        ) : null}
      </form>
    </Drawer>
  );
}

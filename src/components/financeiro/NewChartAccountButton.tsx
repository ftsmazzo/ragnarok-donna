"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { saveChartAccountAction } from "@/app/(painel)/financeiro/actions";

export function NewChartAccountButton({ canWrite }: { canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  if (!canWrite) return null;

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Conta
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Conta do plano"
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="treasury-chart-form"
              className="btn btn-primary"
              disabled={pending}
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form
          id="treasury-chart-form"
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await saveChartAccountAction({
                code: String(fd.get("code") || ""),
                name: String(fd.get("name") || ""),
                syntheticName: String(fd.get("syntheticName") || "") || undefined,
                dfcGroup1: String(fd.get("dfcGroup1") || "") || undefined,
                dfcGroup2: String(fd.get("dfcGroup2") || "") || undefined,
                dreGroup1: String(fd.get("dreGroup1") || "") || undefined,
                dreGroup2: String(fd.get("dreGroup2") || "") || undefined,
              });
              if (res.ok) {
                showToast("Conta salva", "success");
                setOpen(false);
                router.refresh();
              } else showToast(res.error, "error");
            });
          }}
        >
          <div className="form-row-2">
            <label className="form-field">
              <span>Código APR</span>
              <input name="code" required autoFocus />
            </label>
            <label className="form-field">
              <span>Sintética</span>
              <input name="syntheticName" />
            </label>
          </div>
          <label className="form-field">
            <span>Nome analítico</span>
            <input name="name" required />
          </label>
          <div className="form-row-2">
            <label className="form-field">
              <span>DFC grupo I</span>
              <input name="dfcGroup1" />
            </label>
            <label className="form-field">
              <span>DFC grupo II</span>
              <input name="dfcGroup2" />
            </label>
            <label className="form-field">
              <span>DRE grupo I</span>
              <input name="dreGroup1" />
            </label>
            <label className="form-field">
              <span>DRE grupo II</span>
              <input name="dreGroup2" />
            </label>
          </div>
        </form>
      </Modal>
    </>
  );
}

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
      <Modal open={open} onClose={() => setOpen(false)} title="Conta do plano">
        <form
          className="form-grid"
          style={{ gap: 10 }}
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
                showToast("Conta salva");
                setOpen(false);
                router.refresh();
              } else showToast(res.error, "error");
            });
          }}
        >
          <label>
            Código APR
            <input name="code" required className="search-input" />
          </label>
          <label>
            Nome analítico
            <input name="name" required className="search-input" />
          </label>
          <label>
            Sintética
            <input name="syntheticName" className="search-input" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              DFC grupo I
              <input name="dfcGroup1" className="search-input" />
            </label>
            <label>
              DFC grupo II
              <input name="dfcGroup2" className="search-input" />
            </label>
            <label>
              DRE grupo I
              <input name="dreGroup1" className="search-input" />
            </label>
            <label>
              DRE grupo II
              <input name="dreGroup2" className="search-input" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

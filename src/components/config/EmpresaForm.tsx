"use client";

import { useState, useTransition } from "react";
import type { EmpresaFormView } from "@/server/tenant/empresa";
import { saveEmpresaAction } from "@/app/(painel)/configuracoes/empresa/actions";

type Props = { initial: EmpresaFormView };

export function EmpresaForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const result = await saveEmpresaAction({
        nomeFantasia: String(fd.get("nomeFantasia") ?? ""),
        tagline: String(fd.get("tagline") ?? ""),
        slogan: String(fd.get("slogan") ?? ""),
        logradouro: String(fd.get("logradouro") ?? ""),
        bairro: String(fd.get("bairro") ?? ""),
        cidade: String(fd.get("cidade") ?? ""),
        uf: String(fd.get("uf") ?? ""),
        email: String(fd.get("email") ?? ""),
        telefoneFixoHint: String(fd.get("telefoneFixoHint") ?? ""),
        instagram: String(fd.get("instagram") ?? ""),
        facebook: String(fd.get("facebook") ?? ""),
        youtube: String(fd.get("youtube") ?? ""),
        desdeAno: String(fd.get("desdeAno") ?? ""),
        diferenciais: String(fd.get("diferenciais") ?? ""),
        sobre: String(fd.get("sobre") ?? ""),
        servicosSite: String(fd.get("servicosSite") ?? ""),
        horariosText: String(fd.get("horariosText") ?? ""),
      });
      if (result.ok) setMsg("Dados salvos. A Donna já usa estas informações.");
      else setErr(result.error);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="empresa-form"
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      <p className="client-profile-hint">
        O cliente preenche aqui sozinho. A IA lê este cadastro por unidade — WhatsApp operacional
        continua em Conversas (Evolution), não neste formulário.
        {!initial.hasProfile ? (
          <>
            {" "}
            <strong>Ainda sem perfil salvo</strong> — complete e salve.
          </>
        ) : null}
      </p>

      <section>
        <h3 className="section-title">Identidade</h3>
        <div className="empresa-grid">
          <label className="filter-field">
            <span>Nome fantasia</span>
            <input name="nomeFantasia" className="search-input" required defaultValue={initial.nomeFantasia} />
          </label>
          <label className="filter-field">
            <span>Tagline</span>
            <input name="tagline" className="search-input" defaultValue={initial.tagline} />
          </label>
          <label className="filter-field empresa-span-2">
            <span>Slogan</span>
            <input name="slogan" className="search-input" defaultValue={initial.slogan} />
          </label>
          <label className="filter-field">
            <span>Desde (ano)</span>
            <input name="desdeAno" className="search-input" defaultValue={initial.desdeAno} placeholder="2019" />
          </label>
        </div>
      </section>

      <section>
        <h3 className="section-title">Endereço e contato</h3>
        <div className="empresa-grid">
          <label className="filter-field empresa-span-2">
            <span>Logradouro</span>
            <input name="logradouro" className="search-input" defaultValue={initial.logradouro} />
          </label>
          <label className="filter-field">
            <span>Bairro</span>
            <input name="bairro" className="search-input" defaultValue={initial.bairro} />
          </label>
          <label className="filter-field">
            <span>Cidade</span>
            <input name="cidade" className="search-input" defaultValue={initial.cidade} />
          </label>
          <label className="filter-field">
            <span>UF</span>
            <input name="uf" className="search-input" defaultValue={initial.uf} maxLength={2} />
          </label>
          <label className="filter-field">
            <span>E-mail</span>
            <input name="email" type="email" className="search-input" defaultValue={initial.email} />
          </label>
          <label className="filter-field">
            <span>Telefone fixo (opcional)</span>
            <input name="telefoneFixoHint" className="search-input" defaultValue={initial.telefoneFixoHint} />
          </label>
        </div>
      </section>

      <section>
        <h3 className="section-title">Redes</h3>
        <div className="empresa-grid">
          <label className="filter-field">
            <span>Instagram</span>
            <input name="instagram" className="search-input" defaultValue={initial.instagram} />
          </label>
          <label className="filter-field">
            <span>Facebook</span>
            <input name="facebook" className="search-input" defaultValue={initial.facebook} />
          </label>
          <label className="filter-field">
            <span>YouTube</span>
            <input name="youtube" className="search-input" defaultValue={initial.youtube} />
          </label>
        </div>
      </section>

      <section>
        <h3 className="section-title">Horários</h3>
        <p className="muted-note">Uma linha por faixa: <code>Dias|abre|fecha|</code> ou <code>Domingo|||Fechado</code></p>
        <textarea
          name="horariosText"
          className="search-input"
          rows={6}
          defaultValue={initial.horariosText}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
        />
      </section>

      <section>
        <h3 className="section-title">Textos para a IA</h3>
        <div className="empresa-grid">
          <label className="filter-field empresa-span-2">
            <span>Diferenciais (1 por linha)</span>
            <textarea name="diferenciais" className="search-input" rows={4} defaultValue={initial.diferenciais} />
          </label>
          <label className="filter-field empresa-span-2">
            <span>Sobre (1 por linha)</span>
            <textarea name="sobre" className="search-input" rows={4} defaultValue={initial.sobre} />
          </label>
          <label className="filter-field empresa-span-2">
            <span>Serviços do site / catálogo falado (1 por linha)</span>
            <textarea name="servicosSite" className="search-input" rows={4} defaultValue={initial.servicosSite} />
          </label>
        </div>
      </section>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar dados da empresa"}
        </button>
        {msg ? <span className="badge is-success">{msg}</span> : null}
        {err ? <span className="badge is-warn">{err}</span> : null}
      </div>
    </form>
  );
}

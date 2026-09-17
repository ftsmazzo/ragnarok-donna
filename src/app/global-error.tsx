"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          background: "#f2f2f2",
          color: "#333",
        }}
      >
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Algo deu errado</h1>
        <p style={{ margin: "0 0 16px", color: "#6b7280" }}>
          O erro foi registrado. Tente novamente ou volte ao início.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "8px 14px",
              borderRadius: 3,
              border: "none",
              background: "#00a65a",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
          <a
            href="/inicio"
            style={{
              padding: "8px 14px",
              borderRadius: 3,
              border: "1px solid #d2d6de",
              background: "#fff",
              color: "#333",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Início
          </a>
        </div>
        {error.digest ? (
          <p style={{ marginTop: 16, fontSize: 12, color: "#9ca3af" }}>
            Ref: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}

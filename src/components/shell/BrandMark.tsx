"use client";

import { useEffect, useState } from "react";

type Props = {
  logoSrc?: string | null;
  /** Fallback monograma se não houver logo */
  mark?: string;
  alt: string;
  size?: "sm" | "md" | "lg";
  /** Fundo escuro atrás da logo (login card branco). */
  onDark?: boolean;
};

const PNG_FALLBACK = "/branding/ragnarok-logo.png";

const sizeClass = {
  sm: "brand-logo-sm",
  md: "brand-logo-md",
  lg: "brand-logo-lg",
} as const;

/** Logo da unidade (wordmark) ou monograma — shell / login. */
export function BrandMark({ logoSrc, mark = "BR", alt, size = "sm", onDark = false }: Props) {
  const [src, setSrc] = useState(logoSrc || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(logoSrc || null);
    setFailed(false);
  }, [logoSrc]);

  if (src && !failed) {
    return (
      <span className={`brand-logo ${sizeClass[size]}${onDark ? " brand-logo-on-dark" : ""}`}>
        {/* img nativo: SVG via next/image quebra no Safari mobile */}
        <img
          src={src}
          alt={alt}
          className="brand-logo-img"
          decoding="async"
          onError={() => {
            if (src.endsWith(".svg") && src !== PNG_FALLBACK) {
              setSrc(PNG_FALLBACK);
              return;
            }
            setFailed(true);
          }}
        />
      </span>
    );
  }

  return <span className="sidebar-brand-mark">{mark}</span>;
}

import Image from "next/image";

type Props = {
  logoSrc?: string | null;
  /** Fallback monograma se não houver logo */
  mark?: string;
  alt: string;
  size?: "sm" | "md" | "lg";
};

/** Logo da unidade (wordmark) ou monograma — shell / login. */
export function BrandMark({ logoSrc, mark = "BR", alt, size = "sm" }: Props) {
  if (logoSrc) {
    return (
      <span className={`brand-logo brand-logo-${size}`}>
        <Image
          src={logoSrc}
          alt={alt}
          width={size === "lg" ? 220 : size === "md" ? 140 : 110}
          height={size === "lg" ? 72 : size === "md" ? 46 : 36}
          className="brand-logo-img"
          priority
          unoptimized={logoSrc.endsWith(".svg")}
        />
      </span>
    );
  }
  return <span className="sidebar-brand-mark">{mark}</span>;
}

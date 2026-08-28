import { redirect } from "next/navigation";

/** Entrada genérica → tenant padrão do deploy. Cada marca tem URL própria: /login/{slug}. */
export default function LoginIndexPage() {
  const slug = process.env.DEFAULT_TENANT_SLUG?.trim() || "ragnaroks";
  redirect(`/login/${slug}`);
}

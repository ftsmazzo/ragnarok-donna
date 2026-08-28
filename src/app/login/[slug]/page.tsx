import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLoginBrand } from "@/lib/login-brands";
import { LoginTenantView } from "../LoginTenantView";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = getLoginBrand(slug);
  if (!brand) return { title: "Entrar" };
  return {
    title: `Entrar · ${brand.name}`,
    description: brand.tagline,
  };
}

export default async function LoginTenantPage({ params }: Props) {
  const { slug } = await params;
  const brand = getLoginBrand(slug);
  if (!brand) notFound();

  return <LoginTenantView brand={brand} />;
}

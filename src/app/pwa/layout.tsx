import type { Metadata, Viewport } from "next";
import { resolveTenantBrand } from "@/lib/brand";
import { PWA_APPLE_ICON, PWA_ICON } from "@/lib/pwa-brand";
import { requireTenantContext } from "@/server/context/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await requireTenantContext();
  const brand = resolveTenantBrand({
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  });

  return {
    title: `${brand.displayName} · Conversas`,
    manifest: "/manifest-conversas.webmanifest?v=3",
    appleWebApp: {
      capable: true,
      title: brand.displayName,
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [{ url: PWA_ICON, sizes: "192x192", type: "image/png" }],
      apple: [{ url: PWA_APPLE_ICON, sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#e87722",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  return <div className="pwa-shell">{children}</div>;
}

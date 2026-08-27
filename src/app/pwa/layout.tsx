import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Donna · Conversas",
  manifest: "/manifest-conversas.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Donna",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/branding/ragnarok-favicon.png",
    apple: "/branding/ragnarok-favicon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#e87722",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pwa-shell">
      <header className="pwa-top">
        <strong>Donna · Conversas</strong>
        <Link href="/conversas" className="btn btn-ghost btn-sm">
          Painel completo
        </Link>
      </header>
      <div className="pwa-body">{children}</div>
    </div>
  );
}

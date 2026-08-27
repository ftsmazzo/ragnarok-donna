import type { Metadata, Viewport } from "next";

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
  viewportFit: "cover",
};

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  return <div className="pwa-shell">{children}</div>;
}

import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
});

const APP_ICON = "/branding/ragnarok-app-icon-192.png";
const APPLE_ICON = "/apple-touch-icon.png";

export const metadata: Metadata = {
  title: "Barbearia Ragnarok · Painel",
  description: "Gestão da Barbearia Ragnarok com agente WhatsApp Donna",
  manifest: "/manifest-conversas.webmanifest",
  icons: {
    icon: [
      { url: APP_ICON, sizes: "192x192", type: "image/png" },
      { url: "/branding/ragnarok-favicon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: APPLE_ICON, sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon-precomposed.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Barbearia Ragnarok",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href={APPLE_ICON} sizes="180x180" />
        <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon-precomposed.png" />
      </head>
      <body className={quicksand.className}>{children}</body>
    </html>
  );
}

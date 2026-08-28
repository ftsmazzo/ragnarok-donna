import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
});

export const metadata: Metadata = {
  title: "Barbearia Ragnarok · Painel",
  description: "Gestão da Barbearia Ragnarok com agente WhatsApp Donna",
  manifest: "/manifest-conversas.webmanifest",
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
      <body className={quicksand.className}>{children}</body>
    </html>
  );
}

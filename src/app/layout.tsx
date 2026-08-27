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
  icons: {
    icon: "/branding/ragnarok-favicon.png",
    apple: "/branding/ragnarok-favicon.png",
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

import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Fraunces: display, usado com restrição (títulos, números de destaque).
// Manrope: UI/corpo — prioriza legibilidade e velocidade de leitura
// (CLAUDE.md seção 11), a personalidade fica por conta da Fraunces + cor.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "MITIZ Mesas",
  description: "Gerenciamento de mesas, comandas e produção — MITIZ Boutique de Carnes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="bg-bg font-sans text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

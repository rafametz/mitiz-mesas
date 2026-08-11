import type { Metadata, Viewport } from "next";
import { Aleo, Fraunces, Manrope } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
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

// Aleo: só para o nome do app ("MITIZ Mesas"), onde aparece por extenso —
// cabeçalho do app do salão, tela de login, tela de bloqueio biométrico
// (pedido do usuário, 2026-08-11). Fonte da marca em si (className
// font-brand); não substitui a Fraunces (font-display), que continua
// sendo a fonte de títulos/números em geral no resto da interface.
const aleo = Aleo({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "MITIZ Mesas",
  description: "Gerenciamento de mesas, comandas e produção da MITIZ Boutique de Carnes.",
  // manifest.webmanifest é gerado sozinho a partir de src/app/manifest.ts
  // (convenção do App Router) — o Next já injeta o <link rel="manifest">.
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  // "Instalável como app" (pedido do usuário) — capable:true é o que faz
  // o iOS abrir em tela cheia (sem barra do Safari) quando adicionado à
  // tela de início; no Android quem decide isso é o manifest.ts.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MITIZ Mesas",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1A1A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${manrope.variable} ${aleo.variable}`}>
      <body className="bg-bg font-sans text-ink antialiased">
        <ServiceWorkerRegister />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

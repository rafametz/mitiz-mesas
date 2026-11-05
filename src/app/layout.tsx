import type { Metadata, Viewport } from "next";
import { Aleo, Manrope } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import "./globals.css";

// Manrope: UI/corpo — prioriza legibilidade e velocidade de leitura
// (CLAUDE.md seção 11; fonte serifada (Fraunces) removida dos títulos
// operacionais na Fase 13 do plano de modernização de 2026-11-04, ficou
// restrita de verdade à marca via font-brand abaixo).
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Aleo: só para o nome do app ("Mitiz Gestão"), onde aparece por extenso —
// cabeçalho do app do salão, tela de login, tela de bloqueio biométrico
// (pedido do usuário, 2026-08-11). Fonte da marca em si (className
// font-brand); o resto da interface usa a Manrope (font-sans) mesmo em
// títulos e números, sem fonte serifada própria.
const aleo = Aleo({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Mitiz Gestão",
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
    title: "Mitiz Gestão",
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
    <html lang="pt-BR" className={`${manrope.variable} ${aleo.variable}`}>
      <body className="bg-bg font-sans text-ink antialiased">
        <ServiceWorkerRegister />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

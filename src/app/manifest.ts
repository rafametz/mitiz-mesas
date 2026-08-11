import type { MetadataRoute } from "next";

// Convenção do App Router (Next.js gera /manifest.webmanifest sozinho a
// partir disto) — é o que faz o navegador oferecer "Instalar app"
// (rules/frontend-design.md + pedido do usuário: "app quase nativo" no
// celular). Cores batem com tailwind.config.ts (shell/gold — mesma
// combinação já usada no cabeçalho do app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MITIZ Mesas",
    short_name: "MITIZ Mesas",
    description: "Gerenciamento de mesas, comandas e produção da MITIZ Boutique de Carnes.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2ECE6",
    theme_color: "#1A1A1A",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

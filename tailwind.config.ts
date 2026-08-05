import type { Config } from "tailwindcss";

// Identidade visual MITIZ (CLAUDE.md seção 11): "visual premium e sóbrio",
// vermelho escuro, dourado/bege, preto/grafite/cinza/branco. Não é uma
// paleta livre — é a paleta oficial da marca (logotipo fornecido pelo
// usuário), aplicada aqui de propósito.
//
// - bg/ink: superfície de trabalho clara (bege) + texto quase-preto —
//   prioriza leitura rápida em ambiente de restaurante (regra do próprio
//   CLAUDE.md), não escurecemos a tela toda por estética.
// - shell: grafite bem escuro — usado só na navegação (barra inferior /
//   sidebar), como âncora de contraste, não no conteúdo.
// - wine (vermelho escuro): ação primária e marca.
// - gold (dourado/bronze): destaque, estado ativo, valores monetários.
//
// `line`/`shell-line`/os tons `light`/`dark` de wine e gold não vieram da
// paleta oficial (que define só os 5 tons abaixo) — são derivados por
// clareamento/escurecimento dos tons oficiais, para dar variação sem sair
// da paleta da marca.
//
// `free` (verde) é a única exceção deliberada: não é cor de marca, é cor
// funcional de status — verde/vermelho para mesa livre/ocupada é convenção
// quase universal em apps de salão (mapa de mesas), reconhecida à distância
// sem precisar ler texto. Usada só como sinalizador fino (faixa/badge), nunca
// como cor de ação ou identidade.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F2ECE6",
        surface: "#FFFFFF",
        ink: "#1A1A1A",
        muted: "#494949",
        line: "#DAD4CF",
        shell: "#1A1A1A",
        "shell-line": "#3F3F3F",
        wine: {
          DEFAULT: "#AF2B1E",
          dark: "#892217",
          light: "#BF554B",
        },
        gold: {
          DEFAULT: "#B58B57",
          light: "#C4A279",
          dark: "#8D6C44",
        },
        free: {
          DEFAULT: "#3F7D57",
          light: "#5B9A72",
          dark: "#2E5F40",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      borderRadius: {
        card: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;

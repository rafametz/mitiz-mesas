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
//
// Mapeamento semântico (docs/design/design-system.md): a paleta oficial da
// marca tem só 5 cores travadas (bg/ink/muted/wine/gold) — não inventamos
// hex novo para "danger"/"warning"/"success". `wine` cobre erro/perigo
// (SubmitButton variant="danger", Badge tone="wine"), `gold` cobre atenção/
// aguardando, `free` cobre sucesso/disponível. Não existe um "info" ainda
// porque nenhuma tela precisou — não adicionar sem necessidade real.
//
// Espaçamento: a escala de `design-system.md` (4/8/12/16/20/24/32/40/48) é
// exatamente o espaçamento padrão do Tailwind (1/2/3/4/5/6/8/10/12) — não
// precisa de token extra, só usar a escala padrão.
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
        // Só para o nome do app por extenso ("MITIZ Mesas") — ver
        // src/app/layout.tsx.
        brand: ["var(--font-brand)", "serif"],
      },
      borderRadius: {
        // Escala de raios do design system. `control-sm`/`control` cobrem
        // botão/input; `card` (já existia) e `panel` cobrem superfícies;
        // "pill" (badges) não precisa de token — `rounded-full` do Tailwind
        // já resolve. Componentes novos (Button/IconButton/Input) usam
        // `control-sm` por enquanto para ficar pixel-idêntico ao que já
        // está em produção (SubmitButton/TextField usavam `rounded-lg`, que
        // é exatamente 0.5rem) — adotar `control` (10px) fica para quando
        // as telas existentes forem migradas de propósito (não nesta fase).
        "control-sm": "0.5rem",
        control: "0.625rem",
        card: "0.875rem",
        panel: "1rem",
      },
      boxShadow: {
        // Sombras discretas — "priorizar contraste... evitar excesso de
        // efeitos" (CLAUDE.md seção 11). Nenhum componente usa isso ainda
        // nesta fase (Card/Button seguem sem sombra, como já é hoje);
        // ficam disponíveis para painéis flutuantes futuros (diálogo de
        // confirmação, drawer — Fase 2 do plano de modernização).
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        panel: "0 4px 16px -4px rgb(0 0 0 / 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;

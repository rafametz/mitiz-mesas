// Gera os ícones do PWA (public/icons/) a partir do símbolo oficial da
// marca (public/brand/mitiz-symbol.svg) — mesma combinação já usada no
// cabeçalho do app (chama dourada sobre grafite, MitizMark com
// className="text-gold" num fundo bg-shell). Rodar de novo só se a marca
// mudar: `npm run icons:generate`.
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = join(__dirname, "..");
const SYMBOL_PATH = join(ROOT, "public/brand/mitiz-symbol.svg");
const OUT_DIR = join(ROOT, "public/icons");

const SHELL = "#1A1A1A";
const GOLD = "#B58B57";

const rawSvg = readFileSync(SYMBOL_PATH, "utf8");
const pathMatch = rawSvg.match(/<path[^>]*d="([^"]+)"/);
if (!pathMatch) throw new Error("Não encontrei o <path> do símbolo da marca.");
const pathData = pathMatch[1];

// viewBox original do símbolo (147.37 x 178.02) — usado pra centralizar o
// desenho num canvas quadrado sem distorcer a proporção.
const SYMBOL_W = 147.37;
const SYMBOL_H = 178.02;

function buildIconSvg(canvasSize: number, symbolScale: number): string {
  const drawW = SYMBOL_W * symbolScale;
  const drawH = SYMBOL_H * symbolScale;
  const offsetX = (canvasSize - drawW) / 2;
  const offsetY = (canvasSize - drawH) / 2;

  return `<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${canvasSize}" height="${canvasSize}" fill="${SHELL}" />
  <g transform="translate(${offsetX}, ${offsetY}) scale(${symbolScale})">
    <path d="${pathData}" fill="${GOLD}" />
  </g>
</svg>`;
}

async function generate(name: string, canvasSize: number, symbolScale: number) {
  const svg = buildIconSvg(canvasSize, symbolScale);
  await sharp(Buffer.from(svg)).png().toFile(join(OUT_DIR, name));
  console.log(`gerado: public/icons/${name} (${canvasSize}x${canvasSize})`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Ícone "any" — preenche quase todo o canvas (uso normal: barra de
  // tarefas, atalho). Escala calculada pra o símbolo ocupar ~72% da altura.
  const anyScale = 0.72 / (SYMBOL_H / 512);
  await generate("icon-192.png", 192, (0.72 * 192) / SYMBOL_H);
  await generate("icon-512.png", 512, (0.72 * 512) / SYMBOL_H);
  void anyScale;

  // Ícone "maskable" — Android pode recortar em círculo/squircle; a
  // especificação recomenda manter o conteúdo importante dentro de ~80% de
  // diâmetro seguro, então o símbolo ocupa só ~45% da altura do canvas.
  await generate("icon-maskable-512.png", 512, (0.45 * 512) / SYMBOL_H);

  // apple-touch-icon: iOS não suporta transparência nem aplica máscara
  // arredondada sozinho (ele já arredonda visualmente) — mesmo recorte do
  // ícone "any".
  await generate("apple-touch-icon.png", 180, (0.72 * 180) / SYMBOL_H);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

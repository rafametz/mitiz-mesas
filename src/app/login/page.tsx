import { MitizMark } from "@/components/brand/mitiz-mark";
import { APP_VERSION } from "@/lib/version";
import { LoginForm } from "./login-form";

// Hero do sistema: o selo MITIZ, uma vez, com toda a personalidade da
// marca — o resto da interface fica sóbrio (CLAUDE.md seção 11).
//
// Repaginação 2026-11-05 (pedido do usuário, com imagem de referência):
// cartão escurecido (antes era um cartão branco sobre o fundo escuro),
// emblema com brilho sutil atrás da marca, campos com ícone, mostrar/
// ocultar senha, lembrar e-mail, link de ajuda pra recuperação e rodapé
// com versão. De propósito, sem o padrão de ícones decorativos espalhado
// pelo fundo que a referência tinha — contraria frontend-design.md
// ("não usar efeitos visuais apenas decorativos"); o brilho atrás do
// emblema fica porque tem função (hierarquia visual, destaca a marca).
export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-shell px-6 py-12">
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] h-80 w-80 -translate-x-1/2 rounded-full bg-wine/20 blur-3xl"
        aria-hidden
      />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-shell-line bg-white/5 shadow-card">
            <MitizMark className="h-9 w-9 text-gold" />
          </div>
          <div>
            <h1 className="font-brand text-2xl font-semibold italic text-bg">
              Mitiz <span className="text-gold">Gestão</span>
            </h1>
            <p className="mt-1 text-sm tracking-wide text-bg/60">Boutique de Carnes</p>
          </div>
        </div>

        <div className="w-full rounded-card border border-shell-line bg-white/5 p-6 shadow-card">
          <h2 className="text-lg font-semibold text-bg">Entrar</h2>
          <p className="mt-1 text-sm text-bg/60">Use o e-mail e a senha cadastrados.</p>
          <LoginForm />
        </div>

        <div className="text-center text-xs leading-relaxed text-bg/40">
          <p>Problemas para entrar? Fale com o administrador da loja.</p>
          <p className="mt-1">Mitiz Gestão · v{APP_VERSION}</p>
        </div>
      </div>
    </main>
  );
}

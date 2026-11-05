import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { MitizMark } from "@/components/brand/mitiz-mark";

// Autoatendimento de redefinição de senha ainda não existe (pedido do
// usuário, 2026-11-05: por enquanto só orienta a falar com o
// administrador, que reseta a senha em Admin > Usuários > Editar >
// Redefinir senha). Fluxo completo por e-mail (Supabase Auth) fica para
// quando o envio de e-mail do projeto estiver configurado e validado.
export default function EsqueciSenhaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-shell px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <MitizMark className="h-12 w-12 text-gold" />

        <div className="flex w-full flex-col items-center gap-3 rounded-card border border-shell-line bg-white/5 p-6 shadow-card">
          <HelpCircle className="h-8 w-8 text-gold" />
          <h1 className="text-lg font-semibold text-bg">Esqueceu sua senha?</h1>
          <p className="text-sm text-bg/60">
            Fale com o administrador da loja. Ele consegue redefinir sua senha em poucos segundos
            pelo painel de administração.
          </p>
        </div>

        <Link href="/login" className="text-sm font-medium text-gold hover:text-gold-light">
          Voltar para o login
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function SemPermissaoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-8 text-center">
      <ShieldAlert className="h-10 w-10 text-wine" strokeWidth={1.5} />
      <h1 className="font-display text-xl font-semibold text-ink">Sem permissão</h1>
      <p className="max-w-xs text-sm text-muted">
        Seu perfil não tem acesso a esta área. Se acha que deveria ter, fale com um administrador.
      </p>
      <Link href="/" className="mt-2 text-sm font-medium text-wine underline">
        Voltar
      </Link>
    </main>
  );
}

import { MitizMark } from "@/components/brand/mitiz-mark";
import { LoginForm } from "./login-form";

// Hero do sistema: o selo MITIZ, uma vez, com toda a personalidade da
// marca — o resto da interface fica sóbrio (CLAUDE.md seção 11).
export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-shell px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <MitizMark className="h-16 w-16 text-gold" />
          <div>
            <h1 className="font-brand text-2xl font-semibold italic text-bg">MITIZ Mesas</h1>
            <p className="mt-1 text-sm tracking-wide text-bg/60">Boutique de Carnes</p>
          </div>
        </div>

        <div className="w-full rounded-card border border-shell-line bg-surface p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}

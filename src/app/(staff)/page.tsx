import { CircleUserRound } from "lucide-react";
import { requireUser } from "@/application/auth/get-current-user";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/form/submit-button";
import { signOut } from "../login/actions";

// "Conta" — alcançável pela barra inferior. Navegação para Mesas/Admin já
// vive na barra; esta tela é só identidade + sair.
export default async function ContaPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6 pt-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-wine/10 text-wine">
          <CircleUserRound className="h-9 w-9" strokeWidth={1.5} />
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{user.name}</h1>
          <p className="text-sm text-muted">{user.role.label}</p>
        </div>
      </div>

      <Card className="text-sm text-muted">
        <dl className="flex justify-between">
          <dt>E-mail</dt>
          <dd className="text-ink">{user.email}</dd>
        </dl>
      </Card>

      <form action={signOut}>
        <SubmitButton variant="outline" className="w-full">
          Sair
        </SubmitButton>
      </form>
    </main>
  );
}

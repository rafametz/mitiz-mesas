import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { createTable } from "../actions";

export default function NovaMesaPage() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Link href="/admin/mesas" className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Mesas
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">Nova mesa</h1>
      <form action={createTable} className="flex flex-col gap-4">
        <TextField
          label="Número ou nome"
          name="number"
          required
          maxLength={20}
          placeholder="Ex.: 1 ou Varanda 3"
          hint={`Não inclua a palavra "Mesa": ela já aparece automaticamente nas telas.`}
        />
        <TextField label="Capacidade (opcional)" name="capacity" type="number" min={1} />
        <input type="hidden" name="status" value="FREE" />
        <SubmitButton>Criar mesa</SubmitButton>
      </form>
    </div>
  );
}

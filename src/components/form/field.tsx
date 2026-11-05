import { useId } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { inputBaseClass } from "@/components/ui/input";

// Wrapper simples label+input reutilizado nos formulários de admin — evita
// repetir a mesma marcação de label/estilo em cada tela de cadastro.
//
// Usa useId() para o `id`/`htmlFor` (em vez de derivar de `name`) porque a
// mesma página pode ter vários mini-formulários com campos de mesmo `name`
// (ex.: edição do produto + criar grupo de adicionais + criar adicional,
// todos têm um campo "name"/"active") — usar `name` como id colidiria e
// faria o <label> associar ao input errado.
const inputClass = inputBaseClass;
const labelClass = "text-sm font-medium text-ink";

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
};

// Asterisco vermelho no lugar de escrever "(opcional)" em todo campo que
// não exige — pedido do usuário, 2026-11-05: só o obrigatório carrega
// marcação, o resto fica limpo. `aria-hidden` porque o `required` do
// próprio input (sempre repassado junto) já é o sinal acessível de
// verdade pra leitor de tela; o asterisco aqui é só pra quem enxerga.
function RequiredMark() {
  return (
    <span className="text-wine" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

export function TextField({
  label,
  hint,
  className,
  required,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <RequiredMark />}
      </label>
      <input
        id={id}
        required={required}
        className={`${inputClass} ${className ?? ""}`}
        {...props}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  className,
  required,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <RequiredMark />}
      </label>
      <textarea
        id={id}
        required={required}
        className={`${inputClass} h-auto py-2 ${className ?? ""}`}
        rows={3}
        {...props}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  children,
  className,
  required,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <RequiredMark />}
      </label>
      <select id={id} required={required} className={`${inputClass} ${className ?? ""}`} {...props}>
        {children}
      </select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function CheckboxField({
  label,
  name,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-ink">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="h-5 w-5 rounded border-line text-wine focus:ring-gold"
        {...props}
      />
      {label}
    </label>
  );
}

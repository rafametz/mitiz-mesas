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

export function TextField({
  label,
  hint,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} className={`${inputClass} ${className ?? ""}`} {...props} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  className,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea
        id={id}
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
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} className={`${inputClass} ${className ?? ""}`} {...props}>
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

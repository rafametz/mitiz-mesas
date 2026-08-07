import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

// Fonte única do estilo de botão — reutilizada por Button (abaixo) e por
// SubmitButton (src/components/form/submit-button.tsx), que só acrescenta
// o estado `pending` do useFormStatus. Antes da Fase 1 do plano de
// modernização, esse mapa existia duplicado em submit-button.tsx; unificado
// aqui para as duas fontes nunca divergirem de novo
// (docs/design/frontend-audit.md, item "Botões").
export const BUTTON_VARIANTS = {
  primary: "bg-wine text-bg hover:bg-wine-dark",
  outline: "border border-ink/20 text-ink hover:bg-ink/5",
  // Ação secundária "positiva" (ex.: "Adicionar ao pedido") — mesma cor de
  // marca do primary, sem preenchimento. Visualmente muito parecido com
  // "danger" (mesma família wine), mas com significado diferente: não é
  // destrutivo, então usa borda em opacidade cheia em vez de wine/40.
  secondary: "border border-wine text-wine hover:bg-wine/5",
  danger: "border border-wine/40 text-wine hover:bg-wine/5",
} as const;

export const BUTTON_SIZES = {
  // 44px — "padrão" em docs/design/design-system.md.
  md: "h-11 px-4 text-sm",
  // 36px — "compacto".
  sm: "h-9 px-3 text-sm",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export function buttonClassName({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return `inline-flex items-center justify-center gap-1.5 rounded-control-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`;
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & { href: string };

// Botão de ação fora de formulário (ou link estilizado como botão). Para
// botões de submit dentro de <form>, usar SubmitButton — ele já resolve
// estado de carregamento/duplo envio, que Button não trata.
export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant, size, className, children, ...rest } = props;
  const classes = buttonClassName({ variant, size, className });

  if ("href" in props && props.href !== undefined) {
    const { href, ...anchorRest } = rest as Omit<ButtonAsLink, keyof CommonProps>;
    return (
      <Link href={href} className={classes} {...anchorRest}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as Omit<ButtonAsButton, keyof CommonProps>;
  return (
    <button type="button" className={classes} {...buttonRest}>
      {children}
    </button>
  );
}

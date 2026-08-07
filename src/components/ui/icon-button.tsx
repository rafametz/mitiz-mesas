import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

// Botão só de ícone, com alvo de toque mínimo e nome acessível
// obrigatório — endereça o achado de auditoria "botões icon-only sem
// componente nem padrão de tamanho mínimo" (docs/design/frontend-audit.md,
// item "Botões"/"Acessibilidade"): o lápis de editar mesa tinha 24px
// (abaixo até do menor tamanho do design system) e a seta de voltar da
// mesa não tinha nome acessível nenhum (nem `title`, nem `aria-label`).
//
// `label` é obrigatório de propósito — vira `aria-label`, nunca só
// `title` (que não aparece em toque e é lido de forma inconsistente por
// leitor de tela).
const SIZE_CLASS = {
  // 36px — "compacto" em design-system.md, o menor tamanho de controle
  // documentado; não existe variante menor.
  sm: "h-9 w-9",
  md: "h-10 w-10",
} as const;

type IconButtonSize = keyof typeof SIZE_CLASS;

type CommonProps = {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  size?: IconButtonSize;
  className?: string;
};

type IconButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { href?: undefined };

type IconButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & { href: string };

export function IconButton(props: IconButtonAsButton | IconButtonAsLink) {
  const { label, icon: Icon, size = "sm", className = "", ...rest } = props;
  const classes = `inline-flex shrink-0 items-center justify-center rounded-control-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink ${SIZE_CLASS[size]} ${className}`;

  if ("href" in props && props.href !== undefined) {
    const { href, ...anchorRest } = rest as Omit<IconButtonAsLink, keyof CommonProps>;
    return (
      <Link href={href} aria-label={label} title={label} className={classes} {...anchorRest}>
        <Icon className="h-4 w-4" />
      </Link>
    );
  }

  const buttonRest = rest as Omit<IconButtonAsButton, keyof CommonProps>;
  return (
    <button type="button" aria-label={label} title={label} className={classes} {...buttonRest}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

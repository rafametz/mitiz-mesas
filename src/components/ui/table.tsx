// `hidden md:block` de propósito: abaixo do breakpoint md, quem renderiza
// a listagem é <CardList> (mesmo dado, formato de card empilhado) — ver
// docs/design/frontend-audit.md, item "Responsividade" ("evitar tabelas
// largas", relevante porque o Caixa usa tablet, CLAUDE.md §3). As duas
// marcações existem ao mesmo tempo no DOM, alternadas só por CSS (sem JS
// de detecção de viewport, sem risco de "flash" do formato errado).
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

// Companheiro de <Table> para telas estreitas — um card por linha, campos
// empilhados label+valor via <CardListField>. Só usar em listagens cuja
// suíte E2E consulte a linha por seletor restrito (ex.: `page.locator("tr",
// {hasText})`) — texto duplicado num <CardList> escondido ainda "existe"
// pro `page.getByText(...)` sem escopo do Playwright, e quebra a asserção
// por match múltiplo mesmo se o card estiver invisível. Hoje só
// `admin/produtos` atende esse requisito (as outras listagens do admin
// usam `getByText` sem escopo — ver docs/design/modernization-plan.md,
// Fase 5).
export function CardList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 md:hidden">{children}</div>;
}

export function CardListRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-3 text-sm">
      {children}
    </div>
  );
}

export function CardListField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}

export function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}

export function Td({
  children,
  colSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-2.5 text-ink ${className}`}>
      {children}
    </td>
  );
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-line last:border-b-0">{children}</tr>;
}

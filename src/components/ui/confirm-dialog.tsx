"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./button";

// Diálogo de confirmação — endereça o achado crítico da auditoria
// (docs/design/frontend-audit.md, item "Modais"): nenhuma ação com efeito
// imediato tinha confirmação nenhuma além de, no máximo, um campo de texto
// obrigatório. Usa <dialog> nativo (showModal/close) de propósito: foco
// preso, Esc fecha e fundo escurecido vêm de graça do navegador, sem
// biblioteca nova nem lógica de focus-trap escrita à mão.
//
// `confirmSlot` recebe o controle de confirmação pronto (ex.: um
// SubmitButton dentro do <form> real, quando confirmar = enviar um
// formulário; ou um Button com onClick, quando confirmar é só uma
// chamada). O diálogo nunca decide sozinho o que "confirmar" significa.
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel = "Cancelar",
  onCancel,
  confirmSlot,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  cancelLabel?: string;
  onCancel: () => void;
  confirmSlot: React.ReactNode;
  // Conteúdo extra entre a descrição e os botões — hoje só o campo de
  // motivo do cancelamento de item (CancelItemForm), quando a confirmação
  // precisa coletar um dado, não só um "sim/não".
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Esc dispara "cancel" antes de fechar — controlamos nós mesmos
        // (via onCancel, que atualiza o estado do componente pai) em vez
        // de deixar o navegador fechar sozinho, senão os dois ficam fora
        // de sincronia.
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        // Clique no ::backdrop (fora do conteúdo) chega com o próprio
        // <dialog> como target — é o jeito padrão de fazer "clicar fora
        // fecha" sem depender de medir coordenadas.
        if (event.target === ref.current) onCancel();
      }}
      className="fixed left-1/2 top-1/2 z-50 m-0 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-0 shadow-panel backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
          {title}
        </h2>
        <p id={descriptionId} className="text-sm text-muted">
          {description}
        </p>
        {children}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {confirmSlot}
        </div>
      </div>
    </dialog>
  );
}

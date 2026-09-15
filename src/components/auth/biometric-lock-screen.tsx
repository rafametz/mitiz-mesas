"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { MitizMark } from "@/components/brand/mitiz-mark";
import { signOut } from "@/app/login/actions";
import {
  disableBiometric,
  isBiometricEnabled,
  isUnlockedForSession,
  markUnlockedForSession,
  verifyBiometric,
} from "@/lib/webauthn/biometric-lock";

// Portão local por digital/Face ID — só existe se a pessoa ativou isto de
// propósito na tela Conta (BiometricSetup). Reabrir o app dentro da mesma
// sessão do navegador não pede de novo (isUnlockedForSession); fechar e
// abrir de novo pede. A sessão real (cookie do Supabase) nunca muda por
// causa disto — é só uma camada de conveniência na frente de um acesso já
// autorizado (ver comentário em src/lib/webauthn/biometric-lock.ts).
export function BiometricLockScreen({
  user,
  children,
}: {
  user: { id: string; name: string; email: string };
  children: React.ReactNode;
}) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Depois da primeira falha, mostra um jeito de desativar de vez
  // (2026-09-15, relato do usuário: em alguns aparelhos o prompt nativo
  // nunca aparece — a credencial salva não confere mais com o que o
  // sistema tem cadastrado hoje — e a pessoa ficava presa: "Usar senha em
  // vez disso" só troca de sessão, não desativa a exigência, então a
  // próxima vez que entra numa tela que usa este portão cai na mesma
  // tela de novo). `disableBiometric` some com a credencial guardada
  // neste aparelho; a pessoa pode reativar depois pela tela Conta se
  // quiser tentar de novo (ex.: depois de recadastrar a digital no
  // aparelho).
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const shouldLock = isBiometricEnabled(user.id) && !isUnlockedForSession(user.id);
    setLocked(shouldLock);
  }, [user.id]);

  async function attemptUnlock() {
    setVerifying(true);
    setFailed(false);
    const ok = await verifyBiometric(user.id);
    setVerifying(false);
    if (ok) {
      markUnlockedForSession(user.id);
      setLocked(false);
    } else {
      setFailed(true);
      setAttempts((n) => n + 1);
    }
  }

  function handleDisable() {
    disableBiometric(user.id);
    setLocked(false);
  }

  // Tenta sozinho assim que a tela de bloqueio aparece — mais rápido que
  // esperar um toque; o botão "Desbloquear" continua disponível pra quem
  // cancelar o prompt do sistema ou pro navegador não abrir sozinho.
  useEffect(() => {
    if (locked) attemptUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // null = ainda checando localStorage — evita um flash do conteúdo real
  // antes de saber se precisa bloquear.
  if (locked === null) return null;
  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-shell px-6 text-center">
      <MitizMark className="h-12 w-12 text-gold" />
      <div>
        <h1 className="font-display text-lg font-semibold text-bg">
          <span className="font-brand">MITIZ Mesas</span> bloqueado
        </h1>
        <p className="mt-1 text-sm text-bg/60">
          {verifying
            ? "Confirmando..."
            : failed
              ? "Não reconhecido. Tente de novo."
              : "Confirme com sua digital ou Face ID."}
        </p>
      </div>

      <button
        type="button"
        onClick={attemptUnlock}
        disabled={verifying}
        className="flex h-14 items-center gap-2 rounded-full bg-wine px-6 font-semibold text-bg transition-colors hover:bg-wine-dark disabled:opacity-60"
      >
        <Fingerprint className="h-5 w-5" />
        {verifying ? "Confirmando..." : "Desbloquear"}
      </button>

      {/* Sai de verdade antes de mandar pro login — senão o middleware vê
          a sessão ainda válida e devolve pra cá direto, sem mostrar o
          formulário (src/middleware.ts: usuário autenticado em /login
          volta pra "/"). Só troca de sessão — se a biometria continuar
          quebrada neste aparelho, a próxima navegação pra uma tela com
          este portão cai aqui de novo. Por isso o botão "Desativar
          biometria" abaixo, que resolve de vez. */}
      <form action={signOut}>
        <button type="submit" className="text-sm font-medium text-bg/60 underline">
          Usar senha em vez disso
        </button>
      </form>

      {attempts >= 1 && (
        <button
          type="button"
          onClick={handleDisable}
          className="text-xs font-medium text-bg/40 underline"
        >
          Desativar biometria neste aparelho
        </button>
      )}
    </div>
  );
}

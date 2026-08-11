"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  disableBiometric,
  isBiometricAvailable,
  isBiometricEnabled,
  registerBiometric,
} from "@/lib/webauthn/biometric-lock";

// Ativação do desbloqueio rápido por digital/Face ID — vive na tela Conta,
// ao lado de "Sair". Some sozinho se o aparelho não suportar (não é uma
// opção quebrada aparecendo à toa).
export function BiometricSetup({ user }: { user: { id: string; name: string; email: string } }) {
  const { showToast } = useToast();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isBiometricAvailable().then(setAvailable);
    setEnabled(isBiometricEnabled(user.id));
  }, [user.id]);

  if (available === null) return null;
  if (!available) return null;

  async function handleToggle() {
    setError(null);
    setBusy(true);
    try {
      if (enabled) {
        disableBiometric(user.id);
        setEnabled(false);
        showToast("Desbloqueio por biometria desativado.");
      } else {
        await registerBiometric(user);
        setEnabled(true);
        showToast("Desbloqueio por biometria ativado neste aparelho.");
      }
    } catch {
      setError("Não foi possível confirmar a biometria. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-5 w-5 text-wine" />
        <div>
          <p className="text-sm font-semibold text-ink">Desbloqueio por digital/Face ID</p>
          <p className="text-xs text-muted">
            {enabled
              ? "Ativado neste aparelho. Abrir o app de novo pede a biometria em vez da senha."
              : "Evita digitar a senha de novo ao reabrir o app neste aparelho."}
          </p>
        </div>
      </div>
      <Button
        variant={enabled ? "outline" : "secondary"}
        disabled={busy}
        onClick={handleToggle}
        className="self-start"
      >
        {busy ? "Confirmando..." : enabled ? "Desativar" : "Ativar neste aparelho"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-wine">
          {error}
        </p>
      )}
    </div>
  );
}

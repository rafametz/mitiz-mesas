// Desbloqueio rápido por digital/Face ID — usa a API padrão do navegador
// (WebAuthn, "platform authenticator"), sem inventar nada por fora do que
// o próprio sistema operacional já oferece. Importante: isto NÃO é login
// remoto sem senha. É um portão local — a sessão do Supabase (cookie) já
// precisa estar válida; a biometria só confirma "é a mesma pessoa segurando
// este aparelho" antes de mostrar o conteúdo já autorizado, evitando digitar
// senha de novo a cada abertura do app. A fronteira de segurança real
// continua sendo o middleware + a sessão do servidor, sem mudança nenhuma
// aqui (docs/product/business-rules.md — nada disto substitui autenticação).
//
// Só funciona client-side (chama navigator.credentials) — todo consumidor
// é um componente "use client".

const STORAGE_PREFIX = "mitiz.biometric.";

type StoredCredential = { credentialId: string };

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricEnabled(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(storageKey(userId)) !== null;
}

function readCredential(userId: string): StoredCredential | null {
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCredential;
  } catch {
    return null;
  }
}

export function disableBiometric(userId: string): void {
  localStorage.removeItem(storageKey(userId));
  sessionStorage.removeItem(storageKey(userId));
}

// Tempo máximo que o app espera pelo prompt nativo antes de desistir por
// conta própria (2026-09-15, relato do usuário: tela de bloqueio presa em
// "Confirmando..." pra sempre, sem forma de tentar de novo nem de cair
// pra senha). O campo `timeout` do WebAuthn é só uma sugestão pro
// navegador/SO — em alguns aparelhos Android, se o prompt biométrico
// falha em aparecer ou é descartado de um jeito não padrão, a promise de
// `navigator.credentials.*` nunca resolve nem rejeita sozinha.
export const WEBAUTHN_TIMEOUT_MS = 15000;

// Garante que a promise resolvida devolvida daqui SEMPRE se resolve
// dentro de WEBAUTHN_TIMEOUT_MS, não importa o que o navegador faça —
// `controller.abort()` é só uma tentativa educada de cancelar o prompt de
// verdade (nem todo navegador/versão honra `AbortSignal` no WebAuthn,
// mesma razão do `timeout` não bastar sozinho); quem garante o limite é a
// corrida (`Promise.race`) contra o próprio timeout, não o abort.
export function withTimeout<T>(promise: Promise<T>, controller: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("Tempo esgotado aguardando o prompt biométrico."));
    }, WEBAUTHN_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

// Registra a biometria já cadastrada no aparelho pra este usuário —
// abre o prompt nativo (Face ID / digital / Windows Hello). Lança erro se
// a pessoa cancelar, negar ou o prompt não responder a tempo; quem chama
// decide como mostrar isso.
export async function registerBiometric(user: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(user.id);
  const controller = new AbortController();

  const credential = (await withTimeout(
    navigator.credentials.create({
      signal: controller.signal,
      publicKey: {
        challenge,
        rp: { name: "MITIZ Mesas" },
        user: { id: userIdBytes, name: user.email, displayName: user.name },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: WEBAUTHN_TIMEOUT_MS,
        attestation: "none",
      },
    }),
    controller,
  )) as PublicKeyCredential | null;

  if (!credential) throw new Error("Não foi possível registrar a biometria.");

  const stored: StoredCredential = { credentialId: credential.id };
  localStorage.setItem(storageKey(user.id), JSON.stringify(stored));
}

// Pede o prompt biométrico e resolve `true` só se confirmado. Nunca lança
// pra quem chama em caso de cancelamento/falha/travamento — trata como
// "não desbloqueou" (a pessoa sempre pode tentar de novo ou cair para o
// login normal por senha).
export async function verifyBiometric(userId: string): Promise<boolean> {
  const stored = readCredential(userId);
  if (!stored) return false;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const controller = new AbortController();

  try {
    const assertion = await withTimeout(
      navigator.credentials.get({
        signal: controller.signal,
        publicKey: {
          challenge,
          allowCredentials: [{ id: base64UrlToBuffer(stored.credentialId), type: "public-key" }],
          userVerification: "required",
          timeout: WEBAUTHN_TIMEOUT_MS,
        },
      }),
      controller,
    );
    return !!assertion;
  } catch {
    return false;
  }
}

// "Desbloqueado" dura só a sessão do navegador/PWA atual (sessionStorage,
// não localStorage) — fechar e abrir o app de novo pede a biometria de
// novo, mesmo que a sessão do Supabase continue válida por mais tempo.
export function markUnlockedForSession(userId: string): void {
  sessionStorage.setItem(storageKey(userId), "1");
}

export function isUnlockedForSession(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(storageKey(userId)) !== null;
}

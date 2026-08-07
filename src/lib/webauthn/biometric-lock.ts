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

// Registra a biometria já cadastrada no aparelho pra este usuário —
// abre o prompt nativo (Face ID / digital / Windows Hello). Lança erro se
// a pessoa cancelar ou negar; quem chama decide como mostrar isso.
export async function registerBiometric(user: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(user.id);

  const credential = (await navigator.credentials.create({
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
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Não foi possível registrar a biometria.");

  const stored: StoredCredential = { credentialId: credential.id };
  localStorage.setItem(storageKey(user.id), JSON.stringify(stored));
}

// Pede o prompt biométrico e resolve `true` só se confirmado. Nunca lança
// pra quem chama em caso de cancelamento/falha — trata como "não
// desbloqueou" (a pessoa sempre pode cair para o login normal).
export async function verifyBiometric(userId: string): Promise<boolean> {
  const stored = readCredential(userId);
  if (!stored) return false;

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64UrlToBuffer(stored.credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
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

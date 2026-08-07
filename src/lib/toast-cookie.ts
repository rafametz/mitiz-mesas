import "server-only";
import { cookies } from "next/headers";
import { TOAST_COOKIE_NAME } from "./toast-cookie-name";

// Sinaliza um toast de sucesso pra próxima página, quando a própria server
// action redireciona (ex.: createOrderAction) — nesse caso o
// useActionState do formulário nunca vê o estado de sucesso (o redirect
// interrompe antes), então não dá pra disparar o toast a partir dele.
// Cookie de vida curta (10s é mais que suficiente pro redirect + primeira
// pintura da página seguinte), lido e apagado só no cliente — nunca é
// dado de negócio, nunca aparece em log, não é sensível.
export async function setToastCookie(message: string) {
  (await cookies()).set(TOAST_COOKIE_NAME, message, { maxAge: 10, path: "/" });
}

// Só o nome do cookie — sem "server-only", pra poder ser importado tanto
// pelo lado servidor (src/lib/toast-cookie.ts, que grava o cookie) quanto
// pelo client component que lê e apaga (order-sent-toast.tsx). Separado
// num arquivo próprio porque toast-cookie.ts usa `next/headers`, que
// quebra o build se um Client Component importar dele.
export const TOAST_COOKIE_NAME = "mitiz_toast";

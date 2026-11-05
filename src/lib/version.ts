import pkg from "../../package.json";

// Fonte única da versão exibida ao usuário (rodapé do login por enquanto)
// — lê direto do package.json em vez de duplicar o número em código.
// Primeiro passo do versionamento por pacotes pedido pelo usuário
// (2026-11-05); o processo completo (changelog por versão, backlog
// vinculado) é uma iniciativa separada, ainda não decidida.
export const APP_VERSION = pkg.version;

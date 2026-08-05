// Shim para testes (Vitest). O pacote real "server-only" só existe para
// falhar quando o bundler do Next detecta que um módulo marcado com ele foi
// incluído num bundle de cliente — não faz sentido nem se aplica rodando
// sob Vitest/Node puro, então é substituído por um módulo vazio aqui (ver
// alias em vitest.config.ts).
export {};

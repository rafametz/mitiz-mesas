// Módulo 11 — "tempo de mesas abertas": pedido do usuário. Cada linha é um
// atendimento fechado no período, com a duração calculada; ordenado do
// mais demorado pro mais rápido (é o que ajuda a achar mesa "esquecida"
// aberta demais).

export type SessionForDurationReport = {
  id: string;
  tableNumber: string;
  waiterName: string;
  openedAt: Date;
  closedAt: Date;
};

export type TableDurationLine = SessionForDurationReport & { durationMinutes: number };

export function buildTableOpenDuration(sessions: SessionForDurationReport[]): {
  lines: TableDurationLine[];
  averageMinutes: number;
} {
  const lines = sessions
    .map((session) => ({
      ...session,
      durationMinutes: Math.round(
        (session.closedAt.getTime() - session.openedAt.getTime()) / 60000,
      ),
    }))
    .sort((a, b) => b.durationMinutes - a.durationMinutes);

  const averageMinutes =
    lines.length === 0
      ? 0
      : Math.round(lines.reduce((sum, line) => sum + line.durationMinutes, 0) / lines.length);

  return { lines, averageMinutes };
}

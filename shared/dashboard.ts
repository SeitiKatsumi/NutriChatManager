const DAY = 86_400_000;
export const dashboardDate = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export function dashboardWindow(days: number, now: Date) {
  const start = new Date(new Date(`${dashboardDate(now)}T00:00:00-03:00`).getTime() - (days - 1) * DAY);
  return { start, previousStart: new Date(start.getTime() - days * DAY) };
}

export interface DashboardPatient {
  id: string | number;
  fullName: string;
  status?: string | null;
  lastInteractionAt?: string | null;
}
interface MessageActivity { patient_id: string | number; from_me: boolean; date_created: string }

export function buildDashboard(patients: DashboardPatient[], messages: MessageActivity[], days: number, now = new Date()) {
  const { start, previousStart } = dashboardWindow(days, now);
  const ids = new Set(patients.map(p => String(p.id)));
  const series = Array.from({ length: days }, (_, index) => ({
    date: dashboardDate(new Date(start.getTime() + index * DAY)), incoming: 0, outgoing: 0,
  }));
  const byDate = new Map(series.map(day => [day.date, day]));
  const active = new Set<string>(), previousActive = new Set<string>();
  let incoming = 0, outgoing = 0, previousIncoming = 0, previousOutgoing = 0;
  for (const message of messages) {
    if (!ids.has(String(message.patient_id))) continue;
    const time = new Date(message.date_created).getTime();
    if (!Number.isFinite(time) || typeof message.from_me !== 'boolean') throw new Error('Invalid message activity');
    if (time < previousStart.getTime() || time > now.getTime()) continue;
    if (time < start.getTime()) {
      if (message.from_me) previousOutgoing++;
      else { previousIncoming++; previousActive.add(String(message.patient_id)); }
    } else {
      const day = byDate.get(dashboardDate(new Date(time)))!;
      if (message.from_me) { outgoing++; day.outgoing++; }
      else { incoming++; day.incoming++; active.add(String(message.patient_id)); }
    }
  }
  return {
    days, generatedAt: now.toISOString(), start: start.toISOString(), previousStart: previousStart.toISOString(),
    totals: { patients: patients.length, activePatients: active.size, incoming, outgoing, previousActivePatients: previousActive.size, previousIncoming, previousOutgoing },
    series,
    patients: patients.map(({ id, fullName, status, lastInteractionAt }) => ({ id, fullName, status, lastInteractionAt })),
  };
}

export type DashboardOverview = ReturnType<typeof buildDashboard>;

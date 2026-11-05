interface PatientOrderData { id: string | number; fullName?: string; lastInteractionAt?: string | null; createdAt?: string | Date | null }
export function patientStage(status?: string | null): string {
  const labels: Record<string, string> = { active: 'Em atendimento IA', inactive: 'Pausado', completed: 'Concluído' };
  return (status && labels[status]) || status || 'Etapa não informada';
}

export function matchesPatient(patient: { fullName?: string; whatsappNumber?: string | null; phone?: string | null; email?: string | null; status?: string; lastInteractionAt?: string | null }, search: string, stage: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const text = normalize([patient.fullName, patient.whatsappNumber, patient.phone, patient.email].filter(Boolean).join(' '));
  const wanted = normalize(search.trim());
  const digits = wanted.replace(/\D/g, '');
  const matches = text.includes(wanted) || (!!digits && /^[\d\s()+-]+$/.test(wanted) && [patient.whatsappNumber, patient.phone].some(value => value?.replace(/\D/g, '').includes(digits)));
  return matches && (!stage || stage === 'all' || (stage === '__no_interaction' ? !patient.lastInteractionAt : patientStage(patient.status) === stage));
}

export function patientPhone(value?: string | null): string {
  const digits = (value || '').replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, -4)}-${digits.slice(-4)}`;
  return value || 'WhatsApp não informado';
}
export function sortPatients<T extends PatientOrderData>(patients: T[], order: string): T[] {
  const names = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  const nameOrder = (a: T, b: T) => names.compare(a.fullName || '', b.fullName || '') || names.compare(String(a.id), String(b.id));
  return [...patients].sort((a, b) => {
    if (order.startsWith('name-')) return (order === 'name-desc' ? -1 : 1) * nameOrder(a, b);
    const field = order.startsWith('created-') ? 'createdAt' : 'lastInteractionAt';
    const first = a[field] ? new Date(a[field]!).getTime() : NaN;
    const second = b[field] ? new Date(b[field]!).getTime() : NaN;
    if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : nameOrder(a, b);
    if (!Number.isFinite(second)) return -1;
    return (order.endsWith('-asc') ? first - second : second - first) || nameOrder(a, b);
  });
}

export function formatLastInteraction(value?: string | null): string {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    : 'Sem interação';
}

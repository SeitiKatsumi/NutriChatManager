interface PatientOrderData { id: string | number; fullName?: string; lastInteractionAt?: string | null; createdAt?: string | Date | null }
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

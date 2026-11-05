export interface NutritionFields {
  weight?: string | number | null;
  height?: string | number | null;
  medicalHistory?: string | null;
  dietaryRestrictions?: string | null;
  suplementos_medicamentos?: string | null;
  feedbacks?: string | null;
  cafe_da_manha?: string | null;
  lanche_da_manha?: string | null;
  almoco?: string | null;
  lanche_da_tarde?: string | null;
  janta?: string | null;
  ceia?: string | null;
}
export interface Measurement {
  id: string;
  patient_id: number | string;
  measured_on: string;
  weight: number | string;
  waist: number | string | null;
  date_created?: string;
}
const filled = (value: unknown) => value != null && !['', 'null', 'undefined', 'nao informado', 'nao informada'].includes(String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
export function nutritionNumber(value: unknown): number | null {
  const result = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.trim().replace(',', '.')) : NaN;
  return Number.isFinite(result) && result > 0 ? result : null;
}
const mealFields = [
  ['cafe_da_manha', 'Café da manhã'], ['lanche_da_manha', 'Lanche da manhã'], ['almoco', 'Almoço'],
  ['lanche_da_tarde', 'Lanche da tarde'], ['janta', 'Jantar'], ['ceia', 'Ceia'],
] as const;

export function buildNutrition(patients: (NutritionFields & { id: string | number; fullName: string })[], measurements: Measurement[]) {
  const ids = new Set(patients.map(patient => String(patient.id)));
  const history = measurements.filter(item => ids.has(String(item.patient_id))).map(item => ({ ...item, weight: nutritionNumber(item.weight), waist: nutritionNumber(item.waist) }))
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on) || (a.date_created || '').localeCompare(b.date_created || '') || a.id.localeCompare(b.id));
  const people = patients.map(patient => {
    const records = history.filter(item => String(item.patient_id) === String(patient.id));
    const weight = records.at(-1)?.weight ?? nutritionNumber(patient.weight);
    const height = nutritionNumber(patient.height);
    const hasMeals = mealFields.some(([field]) => filled(patient[field]));
    const hasAnamnesis = filled(patient.medicalHistory);
    return { id: patient.id, fullName: patient.fullName, weight, height, hasMeals, hasAnamnesis,
      records: records.length, datedWeight: !!records.length,
      missing: [!weight && 'Peso', !height && 'Altura', !hasAnamnesis && 'Anamnese', !hasMeals && 'Registro alimentar'].filter(Boolean) as string[] };
  });
  const coverage = [
    { label: 'Peso + altura', count: people.filter(patient => patient.weight && patient.height).length, color: '#34d399' },
    { label: 'Anamnese', count: people.filter(patient => patient.hasAnamnesis).length, color: '#7dd3fc' },
    { label: 'Registro alimentar', count: people.filter(patient => patient.hasMeals).length, color: '#a5b4fc' },
    { label: 'Restrições documentadas', count: patients.filter(patient => filled(patient.dietaryRestrictions)).length, color: '#fbbf24' },
  ];
  return { patients: people, measurements: history, coverage,
    meals: mealFields.map(([field, label]) => ({ label, count: patients.filter(patient => filled(patient[field])).length, missing: patients.filter(patient => !filled(patient[field])).length })),
    withEvolution: people.filter(patient => new Set(history.filter(item => String(item.patient_id) === String(patient.id)).map(item => item.measured_on)).size >= 2).length,
  };
}
export type NutritionOverview = ReturnType<typeof buildNutrition>;

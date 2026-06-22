import { z } from "zod";
import { pgTable, serial, text, integer, real, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ========== PostgreSQL Tables (Drizzle ORM) ==========

export const aiConfigTable = pgTable("ai_config", {
  id: serial("id").primaryKey(),
  agent_type: varchar("agent_type", { length: 50 }).notNull().unique(),
  system_prompt: text("system_prompt").notNull(),
  model: varchar("model", { length: 100 }).notNull().default("gpt-4o-mini"),
  max_tokens: integer("max_tokens").notNull().default(800),
  temperature: real("temperature").notNull().default(0.3),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiConfigSchema = createInsertSchema(aiConfigTable).omit({ id: true, updated_at: true });
export type AiConfig = typeof aiConfigTable.$inferSelect;
export type InsertAiConfig = z.infer<typeof insertAiConfigSchema>;

// ========== Zod Schemas (Directus-based models) ==========
// Base Zod schemas for validation and type inference
// These schemas define the data models for our Directus-based storage

// Nutritionist schema
export const nutritionistSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email(),
  password: z.string(),
  cpfCnpj: z.string(), // CPF or CNPJ
  phone: z.string().optional(),
  whatsapp_clinica: z.string().optional(), // WhatsApp da clínica
  address: z.string().optional(),
  specialization: z.string().optional(),
  whatsappNumber: z.string().optional(),
  welcomeMessage: z.string().optional(),
  workingHours: z.string().default("commercial"),
  status: z.string().default("active"), // active, inactive, pending
  status_pagamento: z.enum(["pendente", "ativo", "cancelado", "expirado"]).default("pendente"), // Payment status
  // AI Agent customization fields
  mensagem_inicial: z.string().optional(),      // Initial greeting message from AI agent
  nome_do_agente: z.string().optional(),        // AI agent name
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const insertNutritionistSchema = nutritionistSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Nutritionist = z.infer<typeof nutritionistSchema>;
export type InsertNutritionist = z.infer<typeof insertNutritionistSchema>;

// WhatsApp Message schema - matches Directus collection "whatsapp_messages"
export const whatsappMessageSchema = z.object({
  id: z.number(),
  patient_id: z.string(), // Reference to Cadastro_de_Pacientes (relational field)
  message_body: z.string(),
  from_me: z.boolean(), // true = AI agent, false = patient
  message_type: z.enum(["text", "image", "audio", "video", "document"]).default("text"),
  date_created: z.coerce.date().optional(),
  date_updated: z.coerce.date().optional(),
});

export const insertWhatsappMessageSchema = whatsappMessageSchema.omit({
  id: true,
  date_created: true,
  date_updated: true,
});

export type WhatsappMessage = z.infer<typeof whatsappMessageSchema>;
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;

// Patient schema - matches Directus collection "Cadastro_de_Pacientes"
export const patientSchema = z.object({
  id: z.string(),
  nutritionistId: z.string(),
  fullName: z.string(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable().transform(val => val ? new Date(val) : null),
  gender: z.string().optional().nullable(),
  weight: z.string().optional().nullable(),
  height: z.string().optional().nullable(),
  bmi: z.number().optional().nullable(), // Body Mass Index (IMC)
  age: z.number().optional().nullable(), // Age (Idade)
  medicalHistory: z.string().optional().nullable(),
  dietaryRestrictions: z.string().optional().nullable(),
  goals: z.string().optional().nullable(),
  status: z.string().default("Aguardando agendamento"), // Status de atendimento
  lastConsultation: z.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Campos coletados pela IA
  anamnese_inicial: z.string().optional().nullable(), // Anamnese feita pelo agente de IA
  suplementos_medicamentos: z.string().optional().nullable(), // Informações sobre suplementos e medicamentos
  feedbacks: z.string().optional().nullable(), // Resumo completo dos últimos dias e histórico
  recordatorio_24h: z.string().optional().nullable(), // Recordatório 24 horas com campos de cada hora
  // Campos individuais de refeições
  cafe_da_manha: z.string().optional().nullable(),
  lanche_da_manha: z.string().optional().nullable(),
  almoco: z.string().optional().nullable(),
  lanche_da_tarde: z.string().optional().nullable(),
  janta: z.string().optional().nullable(),
  ceia: z.string().optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const insertPatientSchema = patientSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Patient = z.infer<typeof patientSchema>;
export type InsertPatient = z.infer<typeof insertPatientSchema>;

// Consultation schema
export const consultationSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  nutritionistId: z.string(),
  type: z.string(), // whatsapp, presencial, online
  duration: z.number().optional(), // duration in minutes
  notes: z.string().optional(),
  recommendations: z.string().optional(),
  status: z.string().default("completed"), // scheduled, completed, cancelled
  scheduledAt: z.date().optional(),
  createdAt: z.date(),
});

export const insertConsultationSchema = consultationSchema.omit({
  id: true,
  createdAt: true,
});

export type Consultation = z.infer<typeof consultationSchema>;
export type InsertConsultation = z.infer<typeof insertConsultationSchema>;

// Validation helpers
export const validateEmail = (email: string) => {
  return z.string().email().safeParse(email);
};

export const validatePhone = (phone: string) => {
  return z.string().min(10).max(15).safeParse(phone);
};

export const validateCPFCNPJ = (cpfCnpj: string) => {
  return z.string().min(11).max(18).safeParse(cpfCnpj);
};

// Extended validation schemas for forms
export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = insertNutritionistSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const patientFormSchema = insertPatientSchema.extend({
  email: z.string().email().optional().or(z.literal("")),
});

export const consultationFormSchema = insertConsultationSchema.extend({
  date: z.string(), // For form handling
  time: z.string(), // For form handling
});

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type PatientForm = z.infer<typeof patientFormSchema>;
export type ConsultationForm = z.infer<typeof consultationFormSchema>;

// WhatsApp Schedule Types
export const scheduleTypeEnum = z.enum(['reactivation', 'meal_feedback', 'post_consultation']);
export const scheduleStatusEnum = z.enum(['disabled', 'enabled', 'paused', 'completed']);

// Config schemas for each schedule type
export const reactivationConfigSchema = z.object({
  send_at: z.string(), // ISO datetime for one-shot send
});

export const mealFeedbackConfigSchema = z.object({
  interval_days: z.enum(['7', '15']), // Every 7 or 15 days
  start_date: z.string().optional(), // ISO date when to start
});

export const postConsultationConfigSchema = z.object({
  days_after: z.number().min(1).max(30), // Days after consultation to send
  last_consultation_sent: z.string().optional(), // Track which consultation was already sent
});

export const scheduleConfigSchema = z.union([
  reactivationConfigSchema,
  mealFeedbackConfigSchema,
  postConsultationConfigSchema,
]);

// WhatsApp Schedule schema - for Directus collection "whatsapp_schedules"
export const whatsappScheduleSchema = z.object({
  id: z.number(),
  patient_id: z.number(), // Reference to Cadastro_de_Pacientes
  nutritionist_id: z.string(), // Reference to directus_users
  type: scheduleTypeEnum,
  status: scheduleStatusEnum.default('disabled'),
  message_template: z.string().optional().nullable(),
  config: z.any(), // JSON config based on type
  next_run_at: z.string().optional().nullable(), // ISO datetime
  last_run_at: z.string().optional().nullable(), // ISO datetime
  failure_count: z.number().default(0),
  last_error: z.string().optional().nullable(),
  date_created: z.coerce.date().optional(),
  date_updated: z.coerce.date().optional(),
});

export const insertWhatsappScheduleSchema = whatsappScheduleSchema.omit({
  id: true,
  date_created: true,
  date_updated: true,
  failure_count: true,
  last_run_at: true,
  last_error: true,
});

export type WhatsappSchedule = z.infer<typeof whatsappScheduleSchema>;
export type InsertWhatsappSchedule = z.infer<typeof insertWhatsappScheduleSchema>;
export type ScheduleType = z.infer<typeof scheduleTypeEnum>;
export type ScheduleStatus = z.infer<typeof scheduleStatusEnum>;

// WhatsApp Schedule Log schema - for tracking sent messages
export const whatsappScheduleLogSchema = z.object({
  id: z.number(),
  schedule_id: z.number(), // Reference to whatsapp_schedules
  patient_id: z.number(), // Reference to Cadastro_de_Pacientes
  sent_at: z.string(), // ISO datetime
  status: z.enum(['success', 'failed']),
  // ponytail: Directus field name is legacy; value now stores Twilio Message SID.
  evolution_message_id: z.string().optional().nullable(),
  error_message: z.string().optional().nullable(),
  message_sent: z.string().optional().nullable(), // The actual message that was sent
  date_created: z.coerce.date().optional(),
});

export const insertWhatsappScheduleLogSchema = whatsappScheduleLogSchema.omit({
  id: true,
  date_created: true,
});

export type WhatsappScheduleLog = z.infer<typeof whatsappScheduleLogSchema>;
export type InsertWhatsappScheduleLog = z.infer<typeof insertWhatsappScheduleLogSchema>;

// Dashboard statistics schema
export const dashboardStatsSchema = z.object({
  totalPatients: z.number(),
  activeSchedules: z.number(),
  messagesSentToday: z.number(),
  messagesSentThisWeek: z.number(),
  pendingSchedules: z.number(),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

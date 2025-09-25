import { z } from "zod";

// Base Zod schemas for validation and type inference
// These schemas define the data models for our Directus-based storage

// Nutritionist schema
export const nutritionistSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email(),
  password: z.string(),
  crn: z.string(), // Professional registration number
  phone: z.string().optional(),
  address: z.string().optional(),
  specialization: z.string().optional(),
  whatsappNumber: z.string().optional(),
  welcomeMessage: z.string().optional(),
  workingHours: z.string().default("commercial"),
  status: z.string().default("active"), // active, inactive, pending
  status_pagamento: z.enum(["pendente", "ativo", "cancelado", "expirado"]).default("pendente"), // Payment status
  // Evolution API integration fields
  evolutionInstanceName: z.string().optional(), // Instancia_Evolution in Directus
  evolutionToken: z.string().optional(),        // Token_Evolution in Directus  
  whatsappIA: z.string().optional(),            // Whatsapp_IA in Directus (clean format: 5511983283363)
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

// WhatsApp Instance schema
export const whatsappInstanceSchema = z.object({
  id: z.string(),
  nutritionistId: z.string(),
  instanceId: z.string(), // Evolution API instance ID
  instanceName: z.string().optional(),
  qrCode: z.string().optional(),
  status: z.string().default("disconnected"), // connected, disconnected, connecting
  phoneNumber: z.string().optional(),
  agentName: z.string().default("Assistente NutriBot"),
  autoResponse: z.boolean().default(true),
  config: z.any().optional(), // JSON config object
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const insertWhatsappInstanceSchema = whatsappInstanceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type WhatsappInstance = z.infer<typeof whatsappInstanceSchema>;
export type InsertWhatsappInstance = z.infer<typeof insertWhatsappInstanceSchema>;

// Message schema
export const messageSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  fromNumber: z.string(),
  toNumber: z.string(),
  message: z.string(),
  messageType: z.string().default("text"), // text, image, audio, etc.
  isFromBot: z.boolean().default(false),
  createdAt: z.date(),
});

export const insertMessageSchema = messageSchema.omit({
  id: true,
  createdAt: true,
});

export type Message = z.infer<typeof messageSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

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

export const validateCRN = (crn: string) => {
  return z.string().min(4).max(20).safeParse(crn);
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
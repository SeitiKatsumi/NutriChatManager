// @ts-ignore - directus.js doesn't have type declarations
import { DirectusClient, directusClient, getPatientsMode } from "./lib/directus.js";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import type { IStorage } from "./storage";
import { MemStorage } from "./storage";
import type { Patient, Nutritionist } from "@shared/schema";

// Directus field mappings for collections
const PATIENTS_COLLECTION = "Cadastro_de_Pacientes";
const USERS_COLLECTION = "users";
const WHATSAPP_INSTANCES_COLLECTION = "whatsapp_instances";
const MESSAGES_COLLECTION = "messages";
const CONSULTATIONS_COLLECTION = "consultations";

// Types for Directus collections - using exact Portuguese field names from collection
export interface DirectusPatient {
  id?: string;
  Nutricionista_responsavel: string;
  Nome_Completo: string;
  Email?: string;
  Telefone?: string;
  Whatsapp?: string;
  Data_de_nascimento?: string; // Date as string format "YYYY-MM-DD"
  Sexo?: string; // Masculino, Feminino, Outros
  Peso?: number;
  Altura?: number;
  IMC?: number; // Body Mass Index
  Idade?: number; // Age
  Anamise_inicial?: string;
  Suplementos_e_medicamentos?: string;
  Restricoes_alimentares?: string; // Dietary restrictions field
  Metas_e_objetivos?: string;
  Etapas?: string;
  Ultima_consulta?: string;
  Observacoes?: string;
  Feedbacks?: string;
  // Meal planning fields
  Cafe_da_manha?: string;
  Almoco?: string;
  Lanche_da_manha?: string;
  Lanche_da_tarde?: string;
  Janta?: string;
  Ceia?: string;
  // AI Analysis cache fields
  ultima_analise_ia?: string; // JSON stringified AI insights
  data_ultima_analise?: string; // ISO timestamp of last analysis
  date_created?: Date;
  date_updated?: Date;
}

export interface DirectusUser {
  id?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  role?: string;
  status?: string;
  // Additional nutritionist fields
  full_name?: string;
  cpf_cnpj?: string;
  phone?: string;
  whatsapp_clinica?: string; // WhatsApp da clínica
  address?: string;
  specialization?: string;
  whatsapp_number?: string;
  welcome_message?: string;
  working_hours?: string;
  // Evolution API fields
  Token_Evolution?: string;
  Instancia_Evolution?: string;
  Whatsapp_IA?: string;
  // AI Agent customization fields
  mensagem_inicial?: string; // Initial greeting message from AI agent
  nome_do_agente?: string; // AI agent name
  // Stripe subscription fields
  stripe_customer_id?: string;
  subscription_status?: 'trial' | 'active' | 'past_due' | 'canceled' | 'incomplete' | null;
  status_pagamento?: 'pendente' | 'ativo' | 'cancelado' | 'expirado';
  subscription_id?: string;
  plan_id?: string;
  subscription_start_date?: string; // ISO date string
  subscription_end_date?: string; // ISO date string
  trial_end_date?: string; // ISO date string
  date_created?: Date;
  date_updated?: Date;
}

export interface DirectusWhatsappInstance {
  id?: string;
  nutritionist_id?: string;
  instance_name?: string;
  qr_code?: string;
  status?: string;
  phone_number?: string;
  agent_name?: string;
  auto_response?: boolean;
  config?: any;
  date_created?: Date;
  date_updated?: Date;
}

export interface DirectusMessage {
  id?: string;
  instance_id?: string;
  sender: string;
  content: string;
  message_type?: string;
  is_from_bot?: boolean;
  date_created?: Date;
}

export interface DirectusConsultation {
  id?: string;
  patient_id: string;
  nutritionist_id: string;
  date: Date;
  notes?: string;
  status?: string;
  date_created?: Date;
  date_updated?: Date;
}

// Helper function to map Stripe status to status_pagamento
function mapStripeStatusToPagamento(stripeStatus: string | null): 'pendente' | 'ativo' | 'cancelado' | 'expirado' {
  switch (stripeStatus) {
    case 'active':
    case 'trial':
      return 'ativo';
    case 'canceled':
      return 'cancelado';
    case 'past_due':
    case 'incomplete':
    case 'incomplete_expired':
      return 'expirado';
    default:
      return 'pendente';
  }
}

// Transform functions between local types and Directus types
interface PatientInput {
  nutritionistId?: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: string | null;
  weight?: string | null;
  height?: string | null;
  imc?: string | null;
  idade?: string | null;
  medicalHistory?: string | null;
  anamnese_inicial?: string | null;
  suplementos_medicamentos?: string | null;
  dietaryRestrictions?: string | null;
  goals?: string | null;
  status?: string;
  lastConsultation?: Date | null;
  notes?: string | null;
  cafe_da_manha?: string | null;
  lanche_da_manha?: string | null;
  almoco?: string | null;
  lanche_da_tarde?: string | null;
  janta?: string | null;
  ceia?: string | null;
}

function transformPatientToDirectus(patient: PatientInput): DirectusPatient {
  console.log('Transforming patient to Directus:', patient);
  
  let formattedDate: string | undefined;
  if (patient.dateOfBirth) {
    const date = new Date(patient.dateOfBirth);
    if (!isNaN(date.getTime())) {
      formattedDate = date.toISOString().split('T')[0];
    }
  }

  let formattedWhatsapp: string | undefined;
  if (patient.whatsappNumber) {
    const cleanNumber = patient.whatsappNumber.replace(/\D/g, '');
    if (cleanNumber.length === 11) {
      formattedWhatsapp = `55${cleanNumber}`;
    } else if (cleanNumber.length === 13 && cleanNumber.startsWith('55')) {
      formattedWhatsapp = cleanNumber;
    } else {
      formattedWhatsapp = patient.whatsappNumber;
    }
  }

  const transformed: DirectusPatient = {
    Nutricionista_responsavel: patient.nutritionistId,
    Nome_Completo: patient.fullName,
    Email: patient.email ?? undefined,
    Telefone: patient.phone ?? undefined,
    Whatsapp: formattedWhatsapp,
    Data_de_nascimento: formattedDate,
    Sexo: patient.gender ?? undefined,
    Peso: patient.weight ? parseInt(patient.weight, 10) : undefined,
    Altura: patient.height ? parseInt(patient.height, 10) : undefined,
    Anamise_inicial: patient.medicalHistory || patient.anamnese_inicial || undefined,
    Suplementos_e_medicamentos: patient.suplementos_medicamentos ?? undefined,
    Restricoes_alimentares: patient.dietaryRestrictions ?? undefined,
    Metas_e_objetivos: patient.goals ?? undefined,
    Etapas: patient.status || 'Aguardando agendamento',
    Ultima_consulta: patient.lastConsultation ?? undefined,
    Observacoes: patient.notes ?? undefined,
  };

  if (patient.imc !== undefined) transformed.IMC = patient.imc ?? undefined;
  if (patient.idade !== undefined) transformed.Idade = patient.idade ?? undefined;
  if (patient.cafe_da_manha !== undefined) transformed.Cafe_da_manha = patient.cafe_da_manha ?? undefined;
  if (patient.lanche_da_manha !== undefined) transformed.Lanche_da_manha = patient.lanche_da_manha ?? undefined;
  if (patient.almoco !== undefined) transformed.Almoco = patient.almoco ?? undefined;
  if (patient.lanche_da_tarde !== undefined) transformed.Lanche_da_tarde = patient.lanche_da_tarde ?? undefined;
  if (patient.janta !== undefined) transformed.Janta = patient.janta ?? undefined;
  if (patient.ceia !== undefined) transformed.Ceia = patient.ceia ?? undefined;

  console.log('Transformed patient data:', transformed);
  return transformed;
}

function transformPatientFromDirectus(directusPatient: any): any {
  // Combinar campos do recordatório 24h em um texto organizado
  const recordatorio = [
    directusPatient.Cafe_da_manha ? `Café da manhã: ${directusPatient.Cafe_da_manha}` : null,
    directusPatient.Lanche_da_manha ? `Lanche da manhã: ${directusPatient.Lanche_da_manha}` : null,
    directusPatient.Almoco ? `Almoço: ${directusPatient.Almoco}` : null,
    directusPatient.Lanche_da_tarde ? `Lanche da tarde: ${directusPatient.Lanche_da_tarde}` : null,
    directusPatient.Janta ? `Janta: ${directusPatient.Janta}` : null,
    directusPatient.Ceia ? `Ceia: ${directusPatient.Ceia}` : null,
  ].filter(Boolean).join('\n');

  return {
    id: directusPatient.id,
    nutritionistId: directusPatient.Nutricionista_responsavel,
    fullName: directusPatient.Nome_Completo,
    email: null, // Not available in this collection
    phone: null, // Not available in this collection  
    whatsappNumber: directusPatient.Whatsapp,
    dateOfBirth: directusPatient.Data_de_nascimento,
    gender: directusPatient.Sexo,
    weight: directusPatient.Peso,
    height: directusPatient.Altura,
    bmi: directusPatient.IMC,
    age: directusPatient.Idade,
    medicalHistory: directusPatient.Anamise_inicial,
    // Use Restricoes_alimentares only (separate from supplements)
    dietaryRestrictions: directusPatient.Restricoes_alimentares,
    goals: directusPatient.Metas_e_objetivos,
    status: directusPatient.Etapas,
    lastConsultation: directusPatient.Ultima_consulta,
    notes: directusPatient.Observacoes,
    // Novos campos da IA
    anamnese_inicial: directusPatient.Anamise_inicial,
    suplementos_medicamentos: directusPatient.Suplementos_e_medicamentos,
    feedbacks: directusPatient.Feedbacks,
    recordatorio_24h: recordatorio || null,
    // Campos individuais de refeições
    cafe_da_manha: directusPatient.Cafe_da_manha,
    lanche_da_manha: directusPatient.Lanche_da_manha,
    almoco: directusPatient.Almoco,
    lanche_da_tarde: directusPatient.Lanche_da_tarde,
    janta: directusPatient.Janta,
    ceia: directusPatient.Ceia,
    // Campos de cache de análise IA
    ultimaAnaliseIA: directusPatient.ultima_analise_ia,
    dataUltimaAnalise: directusPatient.data_ultima_analise,
    createdAt: directusPatient.date_created,
    updatedAt: directusPatient.date_updated,
  };
}

function transformUserToDirectus(nutritionist: any): DirectusUser {
  // Only split fullName if it exists (for partial updates like password change)
  let firstName = '';
  let lastName = '';
  
  if (nutritionist.fullName) {
    const nameParts = nutritionist.fullName.split(' ');
    firstName = nameParts[0] || '';
    lastName = nameParts.slice(1).join(' ') || '';
  }
  
  // When whatsappIA is provided (from settings update), sync it to both fields
  const whatsappValue = nutritionist.whatsappIA || nutritionist.whatsappNumber;
  
  return {
    email: nutritionist.email,
    password: nutritionist.password,
    first_name: firstName || '',
    last_name: lastName || '',
    role: nutritionist.role || '90ce89ef-abe3-4359-9fc0-3e882127775a',
    status: nutritionist.status || 'active',
    full_name: nutritionist.fullName,
    cpf_cnpj: nutritionist.cpfCnpj,
    phone: nutritionist.phone,
    whatsapp_clinica: nutritionist.whatsapp_clinica,
    address: nutritionist.address,
    specialization: nutritionist.specialization,
    whatsapp_number: whatsappValue, // Keep both in sync
    welcome_message: nutritionist.welcomeMessage,
    working_hours: nutritionist.workingHours,
    // Evolution API fields
    Token_Evolution: nutritionist.evolutionToken,
    Instancia_Evolution: nutritionist.evolutionInstanceName,
    Whatsapp_IA: whatsappValue, // Keep both in sync
    // AI Agent customization fields
    mensagem_inicial: nutritionist.mensagem_inicial,
    nome_do_agente: nutritionist.nome_do_agente,
    // Stripe subscription fields
    stripe_customer_id: nutritionist.stripeCustomerId,
    subscription_status: nutritionist.subscriptionStatus,
    subscription_id: nutritionist.subscriptionId,
    plan_id: nutritionist.planId,
    subscription_start_date: nutritionist.subscriptionStartDate,
    subscription_end_date: nutritionist.subscriptionEndDate,
    trial_end_date: nutritionist.trialEndDate,
  };
}

function transformUserFromDirectus(directusUser: any): any {
  return {
    id: directusUser.id,
    fullName: directusUser.full_name || `${directusUser.first_name} ${directusUser.last_name}`.trim(),
    email: directusUser.email,
    // Note: password should not be returned from Directus
    password: '', // This will be handled separately
    cpfCnpj: directusUser.cpf_cnpj,
    phone: directusUser.phone,
    whatsapp_clinica: directusUser.whatsapp_clinica,
    address: directusUser.address,
    specialization: directusUser.specialization,
    whatsappNumber: directusUser.whatsapp_number,
    welcomeMessage: directusUser.welcome_message,
    workingHours: directusUser.working_hours,
    status: directusUser.status,
    // Evolution API fields
    evolutionToken: directusUser.Token_Evolution,
    evolutionInstanceName: directusUser.Instancia_Evolution,
    whatsappIA: directusUser.Whatsapp_IA,
    // AI Agent customization fields
    mensagem_inicial: directusUser.mensagem_inicial,
    nome_do_agente: directusUser.nome_do_agente,
    // Stripe subscription fields
    stripeCustomerId: directusUser.stripe_customer_id,
    subscriptionStatus: directusUser.subscription_status,
    status_pagamento: directusUser.status_pagamento || mapStripeStatusToPagamento(directusUser.subscription_status),
    subscriptionId: directusUser.subscription_id,
    planId: directusUser.plan_id,
    subscriptionStartDate: directusUser.subscription_start_date,
    subscriptionEndDate: directusUser.subscription_end_date,
    trialEndDate: directusUser.trial_end_date,
    createdAt: directusUser.date_created,
    updatedAt: directusUser.date_updated,
  };
}

export class DirectusStorage implements IStorage {
  private client = directusClient;
  private memStorage = new MemStorage(); // Fallback for patients when Directus lacks permissions
  private baseUrl = process.env.DIRECTUS_URL || "https://nutrichatbot.app.11mind.com.br";
  private token = process.env.DIRECTUS_TOKEN;
  
  // Initialization method to ensure required fields exist
  async init(): Promise<void> {
    console.log('[Directus] Storage initialized successfully');
    await this.ensureRequiredFields();
  }

  private async ensureRequiredFields(): Promise<void> {
    try {
      console.log('[Directus] Checking required fields in directus_users collection...');
      
      // Get current fields in directus_users collection
      const fieldsResponse = await fetch(`${this.baseUrl}/fields/directus_users`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!fieldsResponse.ok) {
        console.warn(`[Directus] Could not fetch fields (${fieldsResponse.status}): ${fieldsResponse.statusText}`);
        return;
      }

      const fieldsData = await fieldsResponse.json();
      const existingFields = fieldsData.data?.map((field: any) => field.field) || [];
      
      console.log('[Directus] Existing fields count:', existingFields.length);

      // Check if status_pagamento field exists
      if (!existingFields.includes('status_pagamento')) {
        console.log('[Directus] Creating status_pagamento field...');
        await this.createStatusPagamentoField();
      } else {
        console.log('[Directus] ✓ status_pagamento field already exists');
      }

      // Check other required subscription fields
      const requiredFields = ['stripe_customer_id', 'subscription_id', 'subscription_status', 'plan_id'];
      for (const field of requiredFields) {
        if (!existingFields.includes(field)) {
          console.log(`[Directus] Creating missing field: ${field}`);
          await this.createSubscriptionField(field);
        } else {
          console.log(`[Directus] ✓ ${field} field already exists`);
        }
      }

      // Check profile fields
      const profileFields = [
        { name: 'full_name', type: 'string', note: 'Nome completo do nutricionista' },
        { name: 'phone', type: 'string', note: 'Telefone pessoal' },
        { name: 'whatsapp_clinica', type: 'string', note: 'WhatsApp da clínica' },
        { name: 'address', type: 'string', note: 'Endereço do consultório' },
        { name: 'specialization', type: 'string', note: 'Especialização' },
        { name: 'mensagem_inicial', type: 'text', note: 'Mensagem inicial do agente de IA' },
        { name: 'nome_do_agente', type: 'string', note: 'Nome do agente de IA' },
      ];
      
      for (const field of profileFields) {
        if (!existingFields.includes(field.name)) {
          console.log(`[Directus] Creating missing field: ${field.name}`);
          await this.createProfileField(field.name, field.type, field.note);
        } else {
          console.log(`[Directus] ✓ ${field.name} field already exists`);
        }
      }

      // Check and create required fields for Cadastro_de_Pacientes collection
      console.log('[Directus] Checking required fields in Cadastro_de_Pacientes collection...');
      const patientsFieldsResponse = await fetch(`${this.baseUrl}/fields/Cadastro_de_Pacientes`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (patientsFieldsResponse.ok) {
        const patientsFieldsData = await patientsFieldsResponse.json();
        const existingPatientsFields = patientsFieldsData.data?.map((field: any) => field.field) || [];
        
        console.log('[Directus] Existing patient fields count:', existingPatientsFields.length);

        // Check if Restricoes_alimentares field exists
        if (!existingPatientsFields.includes('Restricoes_alimentares')) {
          console.log('[Directus] Creating Restricoes_alimentares field in Cadastro_de_Pacientes...');
          await this.createPatientDietaryRestrictionsField();
        } else {
          console.log('[Directus] ✓ Restricoes_alimentares field already exists in Cadastro_de_Pacientes');
        }

        // Check and create AI analysis cache fields
        if (!existingPatientsFields.includes('ultima_analise_ia')) {
          console.log('[Directus] Creating ultima_analise_ia field in Cadastro_de_Pacientes...');
          await this.createPatientAICacheField('ultima_analise_ia', 'text', 'Cache da última análise de IA (JSON)');
        } else {
          console.log('[Directus] ✓ ultima_analise_ia field already exists in Cadastro_de_Pacientes');
        }

        if (!existingPatientsFields.includes('data_ultima_analise')) {
          console.log('[Directus] Creating data_ultima_analise field in Cadastro_de_Pacientes...');
          await this.createPatientAICacheField('data_ultima_analise', 'timestamp', 'Data/hora da última análise de IA');
        } else {
          console.log('[Directus] ✓ data_ultima_analise field already exists in Cadastro_de_Pacientes');
        }
      } else {
        console.warn(`[Directus] Could not fetch Cadastro_de_Pacientes fields (${patientsFieldsResponse.status})`);
      }

    } catch (error: any) {
      console.warn('[Directus] Error checking/creating fields:', error.message);
    }
  }

  private async createStatusPagamentoField(): Promise<void> {
    try {
      const fieldConfig = {
        field: 'status_pagamento',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          display: 'labels',
          display_options: {
            showAsDot: true,
            choices: [
              { text: 'Pendente', value: 'pendente', foreground: '#FFA500', background: '#FFF3CD' },
              { text: 'Ativo', value: 'ativo', foreground: '#28A745', background: '#D4EDDA' },
              { text: 'Cancelado', value: 'cancelado', foreground: '#DC3545', background: '#F8D7DA' },
              { text: 'Expirado', value: 'expirado', foreground: '#6C757D', background: '#E2E3E5' }
            ]
          },
          options: {
            choices: [
              { text: 'Pendente', value: 'pendente' },
              { text: 'Ativo', value: 'ativo' },
              { text: 'Cancelado', value: 'cancelado' },
              { text: 'Expirado', value: 'expirado' }
            ]
          },
          width: 'half',
          note: 'Status da assinatura do usuário'
        },
        schema: {
          default_value: 'pendente',
          is_nullable: true
        }
      };

      const response = await fetch(`${this.baseUrl}/fields/directus_users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fieldConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      console.log('[Directus] ✓ status_pagamento field created successfully');
    } catch (error: any) {
      console.error('[Directus] Error creating status_pagamento field:', error.message);
      throw error;
    }
  }

  private async createProfileField(fieldName: string, fieldType: string, note: string): Promise<void> {
    try {
      const fieldConfig: any = {
        field: fieldName,
        type: fieldType,
        meta: {
          width: fieldType === 'text' ? 'full' : 'half',
          interface: fieldType === 'text' ? 'input-multiline' : 'input',
          note: note
        },
        schema: {
          is_nullable: true
        }
      };

      const response = await fetch(`${this.baseUrl}/fields/directus_users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fieldConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Directus] Warning creating ${fieldName}: ${errorText}`);
        return;
      }

      console.log(`[Directus] ✓ ${fieldName} field created successfully`);
    } catch (error: any) {
      console.warn(`[Directus] Error creating ${fieldName} field:`, error.message);
    }
  }

  private async createSubscriptionField(fieldName: string): Promise<void> {
    try {
      let fieldConfig: any = {
        field: fieldName,
        type: 'string',
        meta: {
          width: 'half',
          interface: 'input'
        },
        schema: {
          is_nullable: true
        }
      };

      // Customize config based on field type
      switch (fieldName) {
        case 'stripe_customer_id':
          fieldConfig.meta.note = 'ID do cliente no Stripe';
          fieldConfig.meta.readonly = true;
          break;
        case 'subscription_id':
          fieldConfig.meta.note = 'ID da assinatura no Stripe';
          fieldConfig.meta.readonly = true;
          break;
        case 'subscription_status':
          fieldConfig.meta.note = 'Status original da assinatura do Stripe';
          fieldConfig.meta.readonly = true;
          break;
        case 'plan_id':
          fieldConfig.meta.note = 'ID do plano de assinatura';
          break;
      }

      const response = await fetch(`${this.baseUrl}/fields/directus_users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fieldConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Directus] Could not create field ${fieldName} (${response.status}): ${errorText}`);
        return;
      }

      console.log(`[Directus] ✓ ${fieldName} field created successfully`);
    } catch (error: any) {
      console.warn(`[Directus] Error creating ${fieldName} field:`, error.message);
    }
  }

  private async createPatientDietaryRestrictionsField(): Promise<void> {
    try {
      const fieldConfig = {
        field: 'Restricoes_alimentares',
        type: 'text',
        meta: {
          width: 'full',
          interface: 'input-multiline',
          note: 'Restrições alimentares, alergias e intolerâncias do paciente'
        },
        schema: {
          is_nullable: true
        }
      };

      const response = await fetch(`${this.baseUrl}/fields/Cadastro_de_Pacientes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fieldConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Directus] Warning creating Restricoes_alimentares: ${errorText}`);
        return;
      }

      console.log('[Directus] ✓ Restricoes_alimentares field created successfully');
    } catch (error: any) {
      console.warn('[Directus] Error creating Restricoes_alimentares field:', error.message);
    }
  }

  private async createPatientAICacheField(fieldName: string, fieldType: string, note: string): Promise<void> {
    try {
      const fieldConfig: any = {
        field: fieldName,
        type: fieldType,
        meta: {
          width: 'full',
          interface: fieldType === 'text' ? 'input-code' : 'datetime',
          note: note,
          hidden: true,
          group: 'Oculto'
        },
        schema: {
          is_nullable: true
        }
      };

      const response = await fetch(`${this.baseUrl}/fields/Cadastro_de_Pacientes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fieldConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Directus] Warning creating ${fieldName}: ${errorText}`);
        return;
      }

      console.log(`[Directus] ✓ ${fieldName} field created successfully in Cadastro_de_Pacientes`);
    } catch (error: any) {
      console.warn(`[Directus] Error creating ${fieldName} field:`, error.message);
    }
  }

  // Method to update AI analysis cache for a patient
  async updatePatientAICache(patientId: string, insights: any): Promise<boolean> {
    try {
      const updateData = {
        ultima_analise_ia: JSON.stringify(insights),
        data_ultima_analise: new Date().toISOString()
      };

      const response = await fetch(`${this.baseUrl}/items/Cadastro_de_Pacientes/${patientId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        console.error(`[Directus] Failed to update AI cache for patient ${patientId}`);
        return false;
      }

      console.log(`[Directus] ✓ AI cache updated for patient ${patientId}`);
      return true;
    } catch (error: any) {
      console.error('[Directus] Error updating AI cache:', error.message);
      return false;
    }
  }

  // Create a client instance with user token
  private getUserClient(userToken?: string) {
    if (userToken) {
      // Use the unified DirectusClient from server/lib/directus.js
      return new DirectusClient(
        process.env.DIRECTUS_URL || "https://nutrichatbot.app.11mind.com.br", 
        userToken
      );
    }
    return this.client; // Fallback to admin token for user management operations
  }

  // Nutritionists (stored in Directus Users collection)
  async getNutritionist(id: string, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      // Add cache-buster to prevent Directus from returning stale data
      const cacheBuster = Date.now();
      const response = await client.request(`/users/${id}?fields=*&_cb=${cacheBuster}`);
      return transformUserFromDirectus(response.data);
    } catch (error) {
      console.error('Error getting nutritionist:', error);
      return undefined;
    }
  }

  async getNutritionistByEmail(email: string) {
    try {
      const response = await this.client.request(`/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=*`);
      const users = response.data || [];
      const nutritionist = users.find((user: any) => user.role === '90ce89ef-abe3-4359-9fc0-3e882127775a');
      return nutritionist ? transformUserFromDirectus(nutritionist) : undefined;
    } catch (error) {
      console.error('Error getting nutritionist by email:', error);
      return undefined;
    }
  }

  async createNutritionist(insertNutritionist: any) {
    let createdUserId: string | null = null;
    
    try {
      console.log('[Nutritionist Creation] Starting user creation process...');
      
      // Step 1: Create user in Directus (without Evolution fields first)
      const directusUser = transformUserToDirectus(insertNutritionist);
      const userResponse = await this.client.request('/users', {
        method: 'POST',
        body: JSON.stringify(directusUser),
      });
      
      createdUserId = userResponse.data.id;
      console.log(`[Nutritionist Creation] User created in Directus with ID: ${createdUserId}`);
      
      // Step 2: Set up WhatsApp instance fields (Baileys-based)
      const { BaileysService } = await import('./baileys-service.js');
      const cleanWhatsApp = BaileysService.cleanWhatsAppNumber(insertNutritionist.whatsappNumber);
      const instanceName = `nutri_${createdUserId}`;
      
      console.log(`[Baileys] Setting up instance for user ${createdUserId} with WhatsApp: ${cleanWhatsApp}`);
      
      const whatsappUpdate = {
        Instancia_Evolution: instanceName,
        Whatsapp_IA: cleanWhatsApp
      };
      
      console.log('[Nutritionist Creation] Updating user with WhatsApp data:', whatsappUpdate);
      
      await this.client.request(`/users/${createdUserId}`, {
        method: 'PATCH',
        body: JSON.stringify(whatsappUpdate),
      });
      
      console.log('[Nutritionist Creation] User updated successfully with WhatsApp data');
      
      // Step 3: Return the complete user data
      const finalUserResponse = await this.client.request(`/users/${createdUserId}?fields=*`);
      return transformUserFromDirectus(finalUserResponse.data);
      
    } catch (error: any) {
      console.error('Error in createNutritionist:', error);
      
      if (createdUserId) {
        try {
          console.log(`[Cleanup] Deleting user ${createdUserId} due to setup failure`);
          await this.client.request(`/users/${createdUserId}`, {
            method: 'DELETE',
          });
          console.log('[Cleanup] User deleted successfully');
        } catch (cleanupError) {
          console.error('[Cleanup] Failed to delete user:', cleanupError);
        }
      }
      
      throw error;
    }
  }

  async updateNutritionist(id: string, updateData: any, userToken?: string) {
    try {
      // Don't hash password - Directus handles password hashing internally
      const directusUpdate = transformUserToDirectus({
        ...updateData,
        fullName: updateData.fullName, // Ensure fullName is preserved
      });
      
      // Use admin client to update user profile
      // Security is ensured by backend authentication middleware validating the session
      // This allows updating custom fields that regular users don't have permission to edit
      const response = await this.client.request(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(directusUpdate),
      });
      
      return transformUserFromDirectus(response.data);
    } catch (error) {
      console.error('Error updating nutritionist:', error);
      return undefined;
    }
  }

  async listNutritionists(userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      const response = await client.request(`/users?filter[role][_eq]=90ce89ef-abe3-4359-9fc0-3e882127775a&fields=*`);
      const users = response.data || [];
      return users.map(transformUserFromDirectus);
    } catch (error) {
      console.error('Error listing nutritionists:', error);
      return [];
    }
  }

  async deleteNutritionist(id: string, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      await client.request(`/users/${id}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('Error deleting nutritionist:', error);
      return false;
    }
  }

  // Patients (stored in Directus Cadastro_de_Pacientes collection)
  async getPatient(id: string, userToken?: string) {
    try {
      // Use admin client for reading due to Directus role permissions on nutritionist_id field
      // Backend validates ownership through session, providing security without Directus field permissions
      const client = this.client; // Using admin client temporarily
      
      // Explicit field list using all available Directus collection fields (including meal fields, dietary restrictions, and AI cache)
      const fields = 'id,Nutricionista_responsavel,Nome_Completo,Whatsapp,Data_de_nascimento,Sexo,Peso,Altura,Anamise_inicial,Suplementos_e_medicamentos,Restricoes_alimentares,Etapas,IMC,Idade,Feedbacks,Cafe_da_manha,Lanche_da_manha,Almoco,Lanche_da_tarde,Janta,Ceia,ultima_analise_ia,data_ultima_analise,date_created,date_updated';
      
      console.log(`[Directus] Getting patient: ${id}`);
      const response = await client.request(`/items/${PATIENTS_COLLECTION}/${id}?fields=${fields}`);
      console.log(`[Directus] Patient found: ${response.data ? 'yes' : 'no'}`);
      return transformPatientFromDirectus(response.data);
    } catch (error) {
      console.error('Error getting patient:', error);
      return undefined;
    }
  }

  async getPatientsByNutritionist(nutritionistId: string, userToken?: string) {
    try {
      // Use admin client for reading due to Directus role permissions on nutritionist_id field
      // Backend validates ownership through session, providing security without Directus field permissions
      const client = this.client; // Using admin client temporarily
      const encodedId = encodeURIComponent(nutritionistId);
      
      const fields = 'id,Nutricionista_responsavel,Nome_Completo,Whatsapp,Data_de_nascimento,Sexo,Peso,Altura,Anamise_inicial,Suplementos_e_medicamentos,Restricoes_alimentares,Etapas,IMC,Idade,Feedbacks,Cafe_da_manha,Lanche_da_manha,Almoco,Lanche_da_tarde,Janta,Ceia,ultima_analise_ia,data_ultima_analise,date_created,date_updated';
      
      console.log(`[Directus] Getting patients for nutritionist: ${nutritionistId}`);
      // Using correct Directus field name for nutritionist filter
      const response = await client.request(`/items/${PATIENTS_COLLECTION}?filter[Nutricionista_responsavel][_eq]=${encodedId}&fields=${fields}`);
      const patients = response.data || [];
      console.log(`[Directus] Found ${patients.length} patients for nutritionist`);
      return patients.map(transformPatientFromDirectus);
    } catch (error: any) {
      console.error('Error getting patients by nutritionist:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        code: error.code
      });
      return [];
    }
  }

  async createPatient(insertPatient: any, userToken?: string) {
    try {
      console.log('=== CREATE PATIENT DIRECTUS DEBUG ===');
      console.log('insertPatient:', JSON.stringify(insertPatient, null, 2));
      console.log('userToken provided:', !!userToken);
      
      // Use admin client for creating due to Directus role permissions
      // nutritionistId is already validated from session in the route
      const client = this.client;
      const directusPatient = transformPatientToDirectus(insertPatient);
      console.log('directusPatient:', JSON.stringify(directusPatient, null, 2));
      
      const response = await client.request(`/items/${PATIENTS_COLLECTION}?fields=*`, {
        method: 'POST',
        body: JSON.stringify(directusPatient),
        headers: {
          'Prefer': 'return=representation'
        }
      });
      
      console.log('Directus response:', JSON.stringify(response, null, 2));
      console.log('Response data:', response?.data);
      
      // Handle 204 No Content as success (Directus created the item but didn't return data)
      if (!response || response.data === null) {
        console.log('Directus returned success without data (likely 204), creating minimal patient object');
        
        // Return a minimal patient object with the data we have
        return {
          id: 'created', // Placeholder ID
          nutritionistId: insertPatient.nutritionistId,
          fullName: insertPatient.fullName,
          email: insertPatient.email,
          phone: insertPatient.phone,
          whatsappNumber: insertPatient.whatsappNumber,
          dateOfBirth: insertPatient.dateOfBirth,
          gender: insertPatient.gender,
          weight: insertPatient.weight,
          height: insertPatient.height,
          medicalHistory: insertPatient.medicalHistory,
          dietaryRestrictions: insertPatient.dietaryRestrictions,
          goals: insertPatient.goals,
          status: insertPatient.status || 'active',
          lastConsultation: insertPatient.lastConsultation,
          notes: insertPatient.notes,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      
      return transformPatientFromDirectus(response.data);
    } catch (error: any) {
      console.error('Error creating patient:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data || error.response
      });
      throw error;
    }
  }

  async updatePatient(id: string, updateData: any, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      const directusUpdate = transformPatientToDirectus(updateData);
      const response = await client.request(`/items/${PATIENTS_COLLECTION}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(directusUpdate),
      });
      return transformPatientFromDirectus(response.data);
    } catch (error) {
      console.error('Error updating patient:', error);
      return undefined;
    }
  }

  async deletePatient(id: string, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      await client.request(`/items/${PATIENTS_COLLECTION}/${id}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error: any) {
      console.error('Error deleting patient with user token, trying admin token:', error.message);
      try {
        await this.client.request(`/items/${PATIENTS_COLLECTION}/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (adminError: any) {
        console.error('Error deleting patient with admin token:', adminError.message);
        throw adminError;
      }
    }
  }

  // WhatsApp Instances (placeholder - you can implement Directus collection later)
  async getWhatsappInstance(id: string, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      const response = await client.request(`/items/${WHATSAPP_INSTANCES_COLLECTION}/${id}?fields=*`);
      return response.data;
    } catch (error) {
      console.error('Error getting WhatsApp instance:', error);
      return undefined;
    }
  }

  async getWhatsappInstanceByNutritionist(nutritionistId: string, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      const response = await client.request(`/items/${WHATSAPP_INSTANCES_COLLECTION}?filter[nutritionist_id][_eq]=${nutritionistId}&fields=*`);
      const instances = response.data || [];
      return instances[0] || undefined;
    } catch (error) {
      console.error('Error getting WhatsApp instance by nutritionist:', error);
      return undefined;
    }
  }

  async createWhatsappInstance(insertInstance: any, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      const response = await client.request(`/items/${WHATSAPP_INSTANCES_COLLECTION}`, {
        method: 'POST',
        body: JSON.stringify(insertInstance),
      });
      return response.data;
    } catch (error) {
      console.error('Error creating WhatsApp instance:', error);
      throw error;
    }
  }

  async updateWhatsappInstance(id: string, updateData: any, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      const response = await client.request(`/items/${WHATSAPP_INSTANCES_COLLECTION}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
      return response.data;
    } catch (error) {
      console.error('Error updating WhatsApp instance:', error);
      return undefined;
    }
  }

  async listWhatsappInstances(userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      const response = await client.request(`/items/${WHATSAPP_INSTANCES_COLLECTION}?fields=*`);
      return response.data || [];
    } catch (error) {
      console.error('Error listing WhatsApp instances:', error);
      return [];
    }
  }

  async deleteWhatsappInstance(id: string, userToken?: string) {
    try {
      const client = this.getUserClient(userToken);
      await client.request(`/items/${WHATSAPP_INSTANCES_COLLECTION}/${id}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('Error deleting WhatsApp instance:', error);
      return false;
    }
  }

  // Messages (placeholder)
  async createMessage(insertMessage: any) {
    try {
      const response = await this.client.request(`/items/${MESSAGES_COLLECTION}`, {
        method: 'POST',
        body: JSON.stringify(insertMessage),
      });
      return response.data;
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  async getMessagesByInstance(instanceId: string) {
    try {
      const response = await this.client.request(`/items/${MESSAGES_COLLECTION}?filter[instance_id][_eq]=${instanceId}&fields=*`);
      return response.data || [];
    } catch (error) {
      console.error('Error getting messages by instance:', error);
      return [];
    }
  }

  async getMessagesCount() {
    try {
      const response = await this.client.request(`/items/${MESSAGES_COLLECTION}?aggregate[count]=*`);
      return response.data?.[0]?.count || 0;
    } catch (error) {
      console.error('Error getting messages count:', error);
      return 0;
    }
  }

  // Consultations (placeholder)
  async getConsultation(id: string) {
    try {
      const response = await this.client.request(`/items/${CONSULTATIONS_COLLECTION}/${id}?fields=*`);
      return response.data;
    } catch (error) {
      console.error('Error getting consultation:', error);
      return undefined;
    }
  }

  async getConsultationsByPatient(patientId: string) {
    try {
      const response = await this.client.request(`/items/${CONSULTATIONS_COLLECTION}?filter[patient_id][_eq]=${patientId}&fields=*`);
      return response.data || [];
    } catch (error) {
      console.error('Error getting consultations by patient:', error);
      return [];
    }
  }

  async getConsultationsByNutritionist(nutritionistId: string) {
    try {
      const response = await this.client.request(`/items/${CONSULTATIONS_COLLECTION}?filter[nutritionist_id][_eq]=${nutritionistId}&fields=*`);
      return response.data || [];
    } catch (error) {
      console.error('Error getting consultations by nutritionist:', error);
      return [];
    }
  }

  async createConsultation(insertConsultation: any) {
    try {
      const response = await this.client.request(`/items/${CONSULTATIONS_COLLECTION}`, {
        method: 'POST',
        body: JSON.stringify(insertConsultation),
      });
      return response.data;
    } catch (error) {
      console.error('Error creating consultation:', error);
      throw error;
    }
  }

  async updateConsultation(id: string, updateData: any) {
    try {
      const response = await this.client.request(`/items/${CONSULTATIONS_COLLECTION}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
      return response.data;
    } catch (error) {
      console.error('Error updating consultation:', error);
      return undefined;
    }
  }

  // ========== STRIPE SUBSCRIPTION METHODS ==========

  /**
   * Update current user's own subscription status using their own token
   * This bypasses admin token permission issues by letting users update their own data
   */
  async updateMySubscriptionStatus(userId: string, userToken: string, subscriptionData: {
    stripeCustomerId?: string;
    subscription_status: string;
    subscription_id?: string;
    plan_id?: string;
    subscription_start_date?: string;
    subscription_end_date?: string;
  }): Promise<void> {
    const status_pagamento = mapStripeStatusToPagamento(subscriptionData.subscription_status);
    const updateData: Record<string, any> = {
      subscription_status: subscriptionData.subscription_status,
      status_pagamento,
    };
    if (subscriptionData.stripeCustomerId) updateData.stripe_customer_id = subscriptionData.stripeCustomerId;
    if (subscriptionData.subscription_id) updateData.subscription_id = subscriptionData.subscription_id;
    if (subscriptionData.plan_id) updateData.plan_id = subscriptionData.plan_id;
    if (subscriptionData.subscription_start_date) updateData.subscription_start_date = subscriptionData.subscription_start_date;
    if (subscriptionData.subscription_end_date) updateData.subscription_end_date = subscriptionData.subscription_end_date;

    const userClient = this.getUserClient(userToken);
    try {
      await userClient.request(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`[DirectusStorage] ✅ Self-updated subscription for user ${userId}: ${subscriptionData.subscription_status} → ${status_pagamento}`);
    } catch (userTokenError: any) {
      console.warn(`[DirectusStorage] User token update failed, trying admin client: ${userTokenError.message}`);
      // Fallback to admin client
      await this.client.request(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`[DirectusStorage] ✅ Admin-updated subscription for user ${userId}: ${subscriptionData.subscription_status} → ${status_pagamento}`);
    }
  }

  /**
   * Update user subscription data from Stripe webhooks
   */
  async updateUserSubscription(userId: string, subscriptionData: {
    stripeCustomerId?: string;
    subscriptionStatus?: string;
    subscriptionId?: string;
    planId?: string;
    subscriptionStartDate?: string;
    subscriptionEndDate?: string;
    trialEndDate?: string;
  }) {
    try {
      const updateData: Partial<DirectusUser> = {};
      
      if (subscriptionData.stripeCustomerId) updateData.stripe_customer_id = subscriptionData.stripeCustomerId;
      if (subscriptionData.subscriptionStatus) {
        updateData.subscription_status = subscriptionData.subscriptionStatus as any;
        // Also update status_pagamento with mapped value
        updateData.status_pagamento = mapStripeStatusToPagamento(subscriptionData.subscriptionStatus);
      }
      if (subscriptionData.subscriptionId) updateData.subscription_id = subscriptionData.subscriptionId;
      if (subscriptionData.planId) updateData.plan_id = subscriptionData.planId;
      if (subscriptionData.subscriptionStartDate) updateData.subscription_start_date = subscriptionData.subscriptionStartDate;
      if (subscriptionData.subscriptionEndDate) updateData.subscription_end_date = subscriptionData.subscriptionEndDate;
      if (subscriptionData.trialEndDate) updateData.trial_end_date = subscriptionData.trialEndDate;

      const response = await this.client.request(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
      
      return response.data;
    } catch (error: any) {
      console.error(`[DirectusStorage] Error updating user subscription:`, error);
      throw error;
    }
  }

  /**
   * Find user by Stripe customer ID (for webhook processing)
   */
  async getUserByStripeCustomerId(stripeCustomerId: string) {
    try {
      const response = await this.client.request(`/users?filter[stripe_customer_id][_eq]=${encodeURIComponent(stripeCustomerId)}&fields=*`);
      const users = response.data || [];
      return users.length > 0 ? transformUserFromDirectus(users[0]) : undefined;
    } catch (error) {
      console.error('Error getting user by customer ID:', error);
      return undefined;
    }
  }

  /**
   * Find user by email (for webhook processing - avoids Directus cache issues)
   */
  async getUserByEmail(email: string) {
    try {
      console.log(`[DirectusStorage] Searching user by email: ${email}`);
      const response = await this.client.request(`/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=*`);
      const users = response.data || [];
      
      if (users.length > 0) {
        console.log(`[DirectusStorage] ✅ User found by email: ${users[0].id}`);
        return transformUserFromDirectus(users[0]);
      } else {
        console.log(`[DirectusStorage] ❌ No user found with email: ${email}`);
        return undefined;
      }
    } catch (error) {
      console.error('[DirectusStorage] Error getting user by email:', error);
      return undefined;
    }
  }

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    try {
      const user = await this.getNutritionist(userId);
      if (!user) return false;
      
      // Check BOTH fields for active subscription:
      // - status_pagamento: "ativo" (primary field used by webhooks)
      // - subscriptionStatus: "active" (legacy/Stripe field)
      // Either being active is sufficient (handles sync delays)
      const hasActivePaymentStatus = user.status_pagamento === 'ativo';
      const hasActiveSubscriptionStatus = user.subscriptionStatus === 'active';
      
      // User is considered active if either status field indicates active
      const isActive = hasActivePaymentStatus || hasActiveSubscriptionStatus;
      
      console.log(`[Subscription Check] User ${userId}: status_pagamento=${user.status_pagamento}, subscriptionStatus=${user.subscriptionStatus}, isActive=${isActive}`);
      
      return isActive;
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return false;
    }
  }

  /**
   * Get subscription status for a user
   */
  async getSubscriptionStatus(userId: string): Promise<string | null> {
    try {
      const user = await this.getNutritionist(userId);
      return user?.subscriptionStatus || null;
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return null;
    }
  }

  /**
   * Set user to trial status (for new signups)
   */
  async setTrialStatus(userId: string, trialEndDate: string) {
    try {
      return await this.updateUserSubscription(userId, {
        subscriptionStatus: 'trial',
        trialEndDate: trialEndDate
      });
    } catch (error) {
      console.error('Error setting trial status:', error);
      throw error;
    }
  }


  async updateSubscriptionFromWebhook(stripeCustomerId: string, subscriptionData: {
    subscriptionId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    priceId: string | null;
  }): Promise<void> {
    try {
      console.log(`[DirectusStorage] === WEBHOOK UPDATE CALLED ===`);
      console.log(`[DirectusStorage] Looking for customer ID: ${stripeCustomerId}`);
      console.log(`[DirectusStorage] Subscription data:`, JSON.stringify(subscriptionData, null, 2));
      
      // Strategy 1: Try to find user by Stripe customer ID
      let user = await this.getUserByStripeCustomerId(stripeCustomerId);
      console.log(`[DirectusStorage] User found by stripe_customer_id:`, user ? `Yes (ID: ${user.id})` : 'No');
      
      // Strategy 2: If not found, get email from Stripe and search by email (avoids Directus cache issues)
      if (!user) {
        console.log(`[DirectusStorage] ⚠️ User not found by stripe_customer_id, trying email lookup...`);
        
        try {
          // Get customer email from Stripe - use environment's Stripe instance
          const Stripe = require('stripe').default || require('stripe');
          const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2025-08-27.basil',
          });
          
          const customer = await stripeInstance.customers.retrieve(stripeCustomerId);
          
          if ('email' in customer && customer.email) {
            console.log(`[DirectusStorage] Found email from Stripe customer: ${customer.email}`);
            user = await this.getUserByEmail(customer.email);
            
            if (user) {
              console.log(`[DirectusStorage] ✅ User found by email! ID: ${user.id}`);
              
              // Update stripe_customer_id to avoid this lookup next time
              console.log(`[DirectusStorage] Saving stripe_customer_id to user for future webhooks...`);
              await this.updateUserSubscription(user.id, {
                stripeCustomerId: stripeCustomerId
              });
            }
          } else {
            console.error(`[DirectusStorage] ❌ Stripe customer has no email!`);
          }
        } catch (stripeError: any) {
          console.error(`[DirectusStorage] Error fetching customer from Stripe:`, stripeError.message);
        }
      }
      
      if (!user) {
        const errorMsg = `User not found by stripe_customer_id OR email for customer: ${stripeCustomerId}`;
        console.error(`[DirectusStorage] ❌ CRITICAL: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Update user subscription data in Directus
      const updateData = {
        stripe_customer_id: stripeCustomerId, // Always ensure this is set
        subscription_id: subscriptionData.subscriptionId,
        subscription_status: subscriptionData.status,
        status_pagamento: mapStripeStatusToPagamento(subscriptionData.status), // Map to frontend status
        plan_id: subscriptionData.priceId, // Map priceId to planId
        subscription_start_date: subscriptionData.currentPeriodStart.toISOString(),
        subscription_end_date: subscriptionData.currentPeriodEnd.toISOString(),
      };

      console.log(`[DirectusStorage] Updating user ${user.id} with data:`, JSON.stringify(updateData, null, 2));

      await this.client.request(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`[DirectusStorage] ✅ Successfully updated subscription for user ${user.id}: status=${subscriptionData.status}`);
    } catch (error: any) {
      console.error('[DirectusStorage] ❌ Error updating subscription from webhook:', error.message || error);
      console.error('[DirectusStorage] Stack trace:', error.stack);
      throw error;
    }
  }

  async getPatientByWhatsapp(whatsappNumber: string, nutritionistId: string): Promise<Patient | undefined> {
    try {
      const cleanNumber = whatsappNumber.replace(/\D/g, '');
      const fields = 'id,Nutricionista_responsavel,Nome_Completo,Whatsapp,Data_de_nascimento,Sexo,Peso,Altura,Anamise_inicial,Suplementos_e_medicamentos,Restricoes_alimentares,Etapas,IMC,Idade,Feedbacks,Cafe_da_manha,Lanche_da_manha,Almoco,Lanche_da_tarde,Janta,Ceia,ultima_analise_ia,data_ultima_analise,date_created,date_updated';

      const searchVariants = [cleanNumber];
      if (cleanNumber.startsWith('55') && cleanNumber.length === 13) {
        searchVariants.push(cleanNumber.substring(2));
      } else if (cleanNumber.length === 11) {
        searchVariants.push('55' + cleanNumber);
      }

      for (const variant of searchVariants) {
        const response = await this.client.request(
          `/items/${PATIENTS_COLLECTION}?filter[Whatsapp][_eq]=${variant}&filter[Nutricionista_responsavel][_eq]=${encodeURIComponent(nutritionistId)}&fields=${fields}&limit=1`
        );
        const patients = response.data || [];
        if (patients.length > 0) {
          console.log(`[DirectusStorage] Found patient by WhatsApp ${variant}`);
          return transformPatientFromDirectus(patients[0]);
        }
      }

      console.log(`[DirectusStorage] No patient found for WhatsApp ${cleanNumber}, nutritionist ${nutritionistId}`);
      return undefined;
    } catch (error: any) {
      console.error('[DirectusStorage] Error finding patient by WhatsApp:', error.message);
      return undefined;
    }
  }

  async getNutritionistByInstanceName(instanceName: string): Promise<Nutritionist | undefined> {
    try {
      const response = await this.client.request(
        `/users?filter[Instancia_Evolution][_eq]=${encodeURIComponent(instanceName)}&fields=*&limit=1`
      );
      const users = response.data || [];
      if (users.length > 0) {
        return transformUserFromDirectus(users[0]);
      }

      console.log(`[DirectusStorage] No nutritionist found for instance ${instanceName}`);
      return undefined;
    } catch (error: any) {
      console.error('[DirectusStorage] Error finding nutritionist by instance:', error.message);
      return undefined;
    }
  }

  /**
   * Save WhatsApp message to Directus collection
   */
  async saveWhatsappMessage(message: any): Promise<any> {
    try {
      console.log('[DirectusStorage] Saving WhatsApp message:', message);
      
      const response = await this.client.request('/items/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: message.patient_id,
          message_body: message.message_body,
          from_me: message.from_me,
          message_type: message.message_type || 'text',
        }),
      });

      console.log('[DirectusStorage] Message saved successfully');
      return response.data;
    } catch (error: any) {
      console.error('[DirectusStorage] Error saving WhatsApp message:', error.message);
      throw error;
    }
  }

  /**
   * Get WhatsApp messages for a specific patient
   */
  async getPatientMessages(patientId: string, limit: number = 200): Promise<any[]> {
    try {
      console.log(`[DirectusStorage] Getting messages for patient ${patientId}, limit: ${limit}`);
      
      const response = await this.client.request(
        `/items/whatsapp_messages?filter[patient_id][_eq]=${patientId}&sort=-date_created&limit=${limit}`
      );

      const messages = response.data || [];
      console.log(`[DirectusStorage] Found ${messages.length} messages for patient ${patientId}`);
      
      // Transform date_created to Date objects
      return messages.map((msg: any) => ({
        ...msg,
        date_created: msg.date_created ? new Date(msg.date_created) : undefined,
        date_updated: msg.date_updated ? new Date(msg.date_updated) : undefined,
      }));
    } catch (error: any) {
      console.error('[DirectusStorage] Error getting patient messages:', error.message);
      throw error;
    }
  }

}
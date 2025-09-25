// @ts-ignore - directus.js doesn't have type declarations
import { DirectusClient, directusClient, getPatientsMode } from "./lib/directus.js";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import type { IStorage } from "./storage";
import { MemStorage } from "./storage";

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
  Anamise_inicial?: string;
  Suplementos_e_medicamentos?: string;
  Metas_e_objetivos?: string;
  Etapas?: string;
  Ultima_consulta?: string;
  Observacoes?: string;
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
  crn?: string;
  phone?: string;
  address?: string;
  specialization?: string;
  whatsapp_number?: string;
  welcome_message?: string;
  working_hours?: string;
  // Evolution API fields
  Token_Evolution?: string;
  Instancia_Evolution?: string;
  Whatsapp_IA?: string;
  // Stripe subscription fields
  stripe_customer_id?: string;
  subscription_status?: 'trial' | 'active' | 'past_due' | 'canceled' | 'incomplete' | null;
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

// Transform functions between local types and Directus types
function transformPatientToDirectus(patient: any): DirectusPatient {
  console.log('Transforming patient to Directus:', patient);
  
  // Format date as YYYY-MM-DD string
  let formattedDate: string | undefined;
  if (patient.dateOfBirth) {
    const date = new Date(patient.dateOfBirth);
    if (!isNaN(date.getTime())) {
      formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
  }

  // Format WhatsApp number - ensure it has country code format
  let formattedWhatsapp: string | undefined;
  if (patient.whatsappNumber) {
    const cleanNumber = patient.whatsappNumber.replace(/\D/g, ''); // Remove non-digits
    if (cleanNumber.length === 11) {
      formattedWhatsapp = `55${cleanNumber}`; // Add Brazil country code
    } else if (cleanNumber.length === 13 && cleanNumber.startsWith('55')) {
      formattedWhatsapp = cleanNumber; // Already has country code
    } else {
      formattedWhatsapp = patient.whatsappNumber; // Use as-is if format unclear
    }
  }

  const transformed = {
    Nutricionista_responsavel: patient.nutritionistId,
    Nome_Completo: patient.fullName,
    Email: patient.email,
    Telefone: patient.phone,
    Whatsapp: formattedWhatsapp,
    Data_de_nascimento: formattedDate,
    Sexo: patient.gender,
    Peso: patient.weight ? parseInt(patient.weight, 10) : undefined,
    Altura: patient.height ? parseInt(patient.height, 10) : undefined,
    Anamise_inicial: patient.medicalHistory,
    Suplementos_e_medicamentos: patient.dietaryRestrictions,
    Metas_e_objetivos: patient.goals,
    Etapas: patient.status || 'Aguardando agendamento',
    Ultima_consulta: patient.lastConsultation,
    Observacoes: patient.notes,
  };

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
    medicalHistory: directusPatient.Anamise_inicial, // Mantém para compatibilidade
    dietaryRestrictions: directusPatient.Suplementos_e_medicamentos, // Mantém para compatibilidade
    goals: null, // Field not available in collection
    status: directusPatient.Etapas,
    lastConsultation: null, // Field not available in collection
    notes: null, // Field not available in collection
    // Novos campos da IA
    anamnese_inicial: directusPatient.Anamise_inicial,
    suplementos_medicamentos: directusPatient.Suplementos_e_medicamentos,
    feedbacks: directusPatient.Feedbacks,
    recordatorio_24h: recordatorio || null,
    createdAt: directusPatient.date_created,
    updatedAt: directusPatient.date_updated,
  };
}

function transformUserToDirectus(nutritionist: any): DirectusUser {
  const nameParts = nutritionist.fullName.split(' ');
  return {
    email: nutritionist.email,
    password: nutritionist.password,
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' ') || '',
    role: '90ce89ef-abe3-4359-9fc0-3e882127775a',
    status: nutritionist.status || 'active',
    full_name: nutritionist.fullName,
    crn: nutritionist.crn,
    phone: nutritionist.phone,
    address: nutritionist.address,
    specialization: nutritionist.specialization,
    whatsapp_number: nutritionist.whatsappNumber,
    welcome_message: nutritionist.welcomeMessage,
    working_hours: nutritionist.workingHours,
    // Evolution API fields
    Token_Evolution: nutritionist.evolutionToken,
    Instancia_Evolution: nutritionist.evolutionInstanceName,
    Whatsapp_IA: nutritionist.whatsappIA,
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
    crn: directusUser.crn,
    phone: directusUser.phone,
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
    // Stripe subscription fields
    stripeCustomerId: directusUser.stripe_customer_id,
    subscriptionStatus: directusUser.subscription_status,
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
      const response = await client.request(`/users/${id}?fields=*`);
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
      
      // Step 2: Create Evolution API WhatsApp instance
      const { evolutionApi, EvolutionApiService } = await import('./evolution-api.js');
      const cleanWhatsApp = EvolutionApiService.cleanWhatsAppNumber(insertNutritionist.whatsappNumber);
      
      console.log(`[Evolution API] Creating instance for user ${createdUserId} with WhatsApp: ${cleanWhatsApp}`);
      const evolutionInstance = await evolutionApi.createInstance(createdUserId!, cleanWhatsApp);
      
      console.log('[Evolution API] Instance created successfully:', evolutionInstance);
      
      // Step 3: Update user with Evolution API data
      const evolutionUpdate = {
        Token_Evolution: evolutionInstance.hash.apikey,
        Instancia_Evolution: evolutionInstance.instance.instanceName,
        Whatsapp_IA: cleanWhatsApp
      };
      
      console.log('[Nutritionist Creation] Updating user with Evolution data:', evolutionUpdate);
      
      await this.client.request(`/users/${createdUserId}`, {
        method: 'PATCH',
        body: JSON.stringify(evolutionUpdate),
      });
      
      console.log('[Nutritionist Creation] User updated successfully with Evolution data');
      
      // Step 4: Return the complete user data
      const finalUserResponse = await this.client.request(`/users/${createdUserId}?fields=*`);
      return transformUserFromDirectus(finalUserResponse.data);
      
    } catch (error: any) {
      console.error('Error in createNutritionist:', error);
      
      // CRITICAL: If Evolution API fails, cleanup created user to maintain data consistency
      if (createdUserId) {
        try {
          console.log(`[Cleanup] Deleting user ${createdUserId} due to Evolution API failure`);
          await this.client.request(`/users/${createdUserId}`, {
            method: 'DELETE',
          });
          console.log('[Cleanup] User deleted successfully');
        } catch (cleanupError) {
          console.error('[Cleanup] Failed to delete user:', cleanupError);
        }
      }
      
      // Provide user-friendly error message
      if (error?.message?.includes('Evolution API')) {
        throw new Error('Erro ao configurar integração WhatsApp. Tente novamente.');
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
      
      const client = this.getUserClient(userToken);
      const response = await client.request(`/users/${id}`, {
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
      
      // Explicit field list using only available Directus collection fields
      const fields = 'id,Nutricionista_responsavel,Nome_Completo,Whatsapp,Data_de_nascimento,Sexo,Peso,Altura,Anamise_inicial,Suplementos_e_medicamentos,Etapas,date_created,date_updated';
      
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
      
      // Explicit field list using only available Directus collection fields
      const fields = 'id,Nutricionista_responsavel,Nome_Completo,Whatsapp,Data_de_nascimento,Sexo,Peso,Altura,Anamise_inicial,Suplementos_e_medicamentos,Etapas,date_created,date_updated';
      
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
    } catch (error) {
      console.error('Error deleting patient:', error);
      return false;
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
      // Updating subscription for user
      
      const updateData: Partial<DirectusUser> = {};
      
      if (subscriptionData.stripeCustomerId) updateData.stripe_customer_id = subscriptionData.stripeCustomerId;
      if (subscriptionData.subscriptionStatus) updateData.subscription_status = subscriptionData.subscriptionStatus as any;
      if (subscriptionData.subscriptionId) updateData.subscription_id = subscriptionData.subscriptionId;
      if (subscriptionData.planId) updateData.plan_id = subscriptionData.planId;
      if (subscriptionData.subscriptionStartDate) updateData.subscription_start_date = subscriptionData.subscriptionStartDate;
      if (subscriptionData.subscriptionEndDate) updateData.subscription_end_date = subscriptionData.subscriptionEndDate;
      if (subscriptionData.trialEndDate) updateData.trial_end_date = subscriptionData.trialEndDate;

      const response = await this.client.request(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
      
      // Subscription updated successfully
      return response.data;
    } catch (error) {
      console.error('Error updating user subscription:', error);
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
   * Check if user has active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    try {
      const user = await this.getNutritionist(userId);
      if (!user) return false;
      
      // SECURITY: Require active status AND valid subscription ID AND plan ID
      // This prevents users from accessing the app without paying
      const hasActiveStatus = user.subscriptionStatus === 'active';
      const hasValidSubscription = !!(user.subscriptionId && user.planId);
      
      return hasActiveStatus && hasValidSubscription;
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
      // First find the user by Stripe customer ID
      const user = await this.getUserByStripeCustomerId(stripeCustomerId);
      if (!user) {
        console.error(`[DirectusStorage] User not found for Stripe customer ID: ${stripeCustomerId}`);
        return;
      }

      // Update user subscription data in Directus
      const updateData = {
        subscription_id: subscriptionData.subscriptionId,
        subscription_status: subscriptionData.status,
        plan_id: subscriptionData.priceId, // Map priceId to planId
        subscription_start_date: subscriptionData.currentPeriodStart.toISOString(),
        subscription_end_date: subscriptionData.currentPeriodEnd.toISOString(),
      };

      await this.client.request(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`[DirectusStorage] Updated subscription for user ${user.id}: status=${subscriptionData.status}`);
    } catch (error) {
      console.error('[DirectusStorage] Error updating subscription from webhook:', error);
      throw error;
    }
  }
}
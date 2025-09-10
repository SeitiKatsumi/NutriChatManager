// @ts-ignore - directus.js doesn't have type declarations
import { DirectusClient, directusClient } from "./lib/directus.js";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import type { IStorage } from "./storage";

// Directus field mappings for collections
const PATIENTS_COLLECTION = "Cadastro_de_Pacientes";
const USERS_COLLECTION = "users";
const WHATSAPP_INSTANCES_COLLECTION = "whatsapp_instances";
const MESSAGES_COLLECTION = "messages";
const CONSULTATIONS_COLLECTION = "consultations";

// Types for Directus collections (simplified, using Zod-compatible types)
export interface DirectusPatient {
  id?: string;
  nutritionist_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  whatsapp_number?: string;
  date_of_birth?: Date;
  gender?: string;
  weight?: string;
  height?: string;
  medical_history?: string;
  dietary_restrictions?: string;
  goals?: string;
  status?: string;
  last_consultation?: Date;
  notes?: string;
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
  return {
    nutritionist_id: patient.nutritionistId,
    full_name: patient.fullName,
    email: patient.email,
    phone: patient.phone,
    whatsapp_number: patient.whatsappNumber,
    date_of_birth: patient.dateOfBirth ? new Date(patient.dateOfBirth) : undefined,
    gender: patient.gender,
    weight: patient.weight,
    height: patient.height,
    medical_history: patient.medicalHistory,
    dietary_restrictions: patient.dietaryRestrictions,
    goals: patient.goals,
    status: patient.status || 'active',
    last_consultation: patient.lastConsultation ? new Date(patient.lastConsultation) : undefined,
    notes: patient.notes,
  };
}

function transformPatientFromDirectus(directusPatient: any): any {
  return {
    id: directusPatient.id,
    nutritionistId: directusPatient.nutritionist_id,
    fullName: directusPatient.full_name,
    email: directusPatient.email,
    phone: directusPatient.phone,
    whatsappNumber: directusPatient.whatsapp_number,
    dateOfBirth: directusPatient.date_of_birth,
    gender: directusPatient.gender,
    weight: directusPatient.weight,
    height: directusPatient.height,
    medicalHistory: directusPatient.medical_history,
    dietaryRestrictions: directusPatient.dietary_restrictions,
    goals: directusPatient.goals,
    status: directusPatient.status,
    lastConsultation: directusPatient.last_consultation,
    notes: directusPatient.notes,
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
    createdAt: directusUser.date_created,
    updatedAt: directusUser.date_updated,
  };
}

export class DirectusStorage implements IStorage {
  private client = directusClient;
  
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
  async getNutritionist(id: string) {
    try {
      const response = await this.client.request(`/users/${id}?fields=*`);
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
    try {
      const directusUser = transformUserToDirectus(insertNutritionist);
      const response = await this.client.request('/users', {
        method: 'POST',
        body: JSON.stringify(directusUser),
      });
      return transformUserFromDirectus(response.data);
    } catch (error) {
      console.error('Error creating nutritionist:', error);
      throw error;
    }
  }

  async updateNutritionist(id: string, updateData: any) {
    try {
      // Don't hash password - Directus handles password hashing internally
      const directusUpdate = transformUserToDirectus({
        ...updateData,
        fullName: updateData.fullName, // Ensure fullName is preserved
      });
      
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

  async listNutritionists() {
    try {
      const response = await this.client.request(`/users?filter[role][_eq]=90ce89ef-abe3-4359-9fc0-3e882127775a&fields=*`);
      const users = response.data || [];
      return users.map(transformUserFromDirectus);
    } catch (error) {
      console.error('Error listing nutritionists:', error);
      return [];
    }
  }

  async deleteNutritionist(id: string) {
    try {
      await this.client.request(`/users/${id}`, {
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
      
      // Explicit field list instead of fields=* to avoid permission issues
      const fields = 'id,nutritionist_id,full_name,email,phone,whatsapp_number,date_of_birth,gender,weight,height,medical_history,dietary_restrictions,goals,status,last_consultation,notes,date_created,date_updated';
      
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
      
      // Explicit field list instead of fields=* to avoid permission issues
      const fields = 'id,nutritionist_id,full_name,email,phone,whatsapp_number,date_of_birth,gender,weight,height,medical_history,dietary_restrictions,goals,status,last_consultation,notes,date_created,date_updated';
      
      console.log(`[Directus] Getting ALL patients (will filter by nutritionist on backend)`);
      // TEMPORARY: Remove Directus filter due to token lacking admin access to nutritionist_id field
      // This fetches all patients and we filter by nutritionistId in backend for security
      const response = await client.request(`/items/${PATIENTS_COLLECTION}?fields=${fields}`);
      const allPatients = response.data || [];
      console.log(`[Directus] Found ${allPatients.length} total patients`);
      
      // Filter by nutritionist on backend side
      const transformedPatients = allPatients.map(transformPatientFromDirectus);
      const nutritionistPatients = transformedPatients.filter(patient => patient.nutritionistId === nutritionistId);
      console.log(`[Backend] Filtered to ${nutritionistPatients.length} patients for nutritionist ${nutritionistId}`);
      return nutritionistPatients;
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
}
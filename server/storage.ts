import { type Nutritionist, type InsertNutritionist, type WhatsappInstance, type InsertWhatsappInstance, type Message, type InsertMessage, type Patient, type InsertPatient, type Consultation, type InsertConsultation, nutritionists, whatsappInstances, messages, patients, consultations } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Nutritionists
  getNutritionist(id: string): Promise<Nutritionist | undefined>;
  getNutritionistByEmail(email: string): Promise<Nutritionist | undefined>;
  createNutritionist(nutritionist: InsertNutritionist): Promise<Nutritionist>;
  updateNutritionist(id: string, nutritionist: Partial<InsertNutritionist>): Promise<Nutritionist | undefined>;
  listNutritionists(): Promise<Nutritionist[]>;
  deleteNutritionist(id: string): Promise<boolean>;

  // WhatsApp Instances
  getWhatsappInstance(id: string): Promise<WhatsappInstance | undefined>;
  getWhatsappInstanceByNutritionist(nutritionistId: string): Promise<WhatsappInstance | undefined>;
  createWhatsappInstance(instance: InsertWhatsappInstance): Promise<WhatsappInstance>;
  updateWhatsappInstance(id: string, instance: Partial<InsertWhatsappInstance>): Promise<WhatsappInstance | undefined>;
  listWhatsappInstances(): Promise<WhatsappInstance[]>;
  deleteWhatsappInstance(id: string): Promise<boolean>;

  // Messages
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByInstance(instanceId: string): Promise<Message[]>;
  getMessagesCount(): Promise<number>;

  // Patients
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientsByNutritionist(nutritionistId: string): Promise<Patient[]>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient | undefined>;
  deletePatient(id: string): Promise<boolean>;

  // Consultations
  getConsultation(id: string): Promise<Consultation | undefined>;
  getConsultationsByPatient(patientId: string): Promise<Consultation[]>;
  getConsultationsByNutritionist(nutritionistId: string): Promise<Consultation[]>;
  createConsultation(consultation: InsertConsultation): Promise<Consultation>;
  updateConsultation(id: string, consultation: Partial<InsertConsultation>): Promise<Consultation | undefined>;
}

export class MemStorage implements IStorage {
  private nutritionists: Map<string, Nutritionist>;
  private whatsappInstances: Map<string, WhatsappInstance>;
  private messages: Map<string, Message>;

  constructor() {
    this.nutritionists = new Map();
    this.whatsappInstances = new Map();
    this.messages = new Map();
  }

  // Nutritionists
  async getNutritionist(id: string): Promise<Nutritionist | undefined> {
    return this.nutritionists.get(id);
  }

  async getNutritionistByEmail(email: string): Promise<Nutritionist | undefined> {
    return Array.from(this.nutritionists.values()).find(
      (nutritionist) => nutritionist.email === email,
    );
  }

  async createNutritionist(insertNutritionist: InsertNutritionist): Promise<Nutritionist> {
    const id = randomUUID();
    const now = new Date();
    
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(insertNutritionist.password, 10);
    
    const nutritionist: Nutritionist = {
      ...insertNutritionist,
      password: hashedPassword,
      id,
      createdAt: now,
      updatedAt: now,
      address: insertNutritionist.address ?? null,
      phone: insertNutritionist.phone ?? null,
      specialization: insertNutritionist.specialization ?? null,
      whatsappNumber: insertNutritionist.whatsappNumber ?? null,
      welcomeMessage: insertNutritionist.welcomeMessage ?? null,
      workingHours: insertNutritionist.workingHours ?? null,
      status: insertNutritionist.status ?? null,
    };
    this.nutritionists.set(id, nutritionist);
    return nutritionist;
  }

  async updateNutritionist(id: string, updateData: Partial<InsertNutritionist>): Promise<Nutritionist | undefined> {
    const existing = this.nutritionists.get(id);
    if (!existing) return undefined;

    // Hash password if it's being updated
    let processedUpdateData = { ...updateData };
    if (updateData.password) {
      processedUpdateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updated: Nutritionist = {
      ...existing,
      ...processedUpdateData,
      updatedAt: new Date(),
    };
    this.nutritionists.set(id, updated);
    return updated;
  }

  async listNutritionists(): Promise<Nutritionist[]> {
    return Array.from(this.nutritionists.values());
  }

  async deleteNutritionist(id: string): Promise<boolean> {
    return this.nutritionists.delete(id);
  }

  // WhatsApp Instances
  async getWhatsappInstance(id: string): Promise<WhatsappInstance | undefined> {
    return this.whatsappInstances.get(id);
  }

  async getWhatsappInstanceByNutritionist(nutritionistId: string): Promise<WhatsappInstance | undefined> {
    return Array.from(this.whatsappInstances.values()).find(
      (instance) => instance.nutritionistId === nutritionistId,
    );
  }

  async createWhatsappInstance(insertInstance: InsertWhatsappInstance): Promise<WhatsappInstance> {
    const id = randomUUID();
    const now = new Date();
    const instance: WhatsappInstance = {
      ...insertInstance,
      id,
      createdAt: now,
      updatedAt: now,
      nutritionistId: insertInstance.nutritionistId ?? null,
      instanceName: insertInstance.instanceName ?? null,
      qrCode: insertInstance.qrCode ?? null,
      status: insertInstance.status ?? null,
      phoneNumber: insertInstance.phoneNumber ?? null,
      agentName: insertInstance.agentName ?? null,
      autoResponse: insertInstance.autoResponse ?? null,
      config: insertInstance.config ?? null,
    };
    this.whatsappInstances.set(id, instance);
    return instance;
  }

  async updateWhatsappInstance(id: string, updateData: Partial<InsertWhatsappInstance>): Promise<WhatsappInstance | undefined> {
    const existing = this.whatsappInstances.get(id);
    if (!existing) return undefined;

    const updated: WhatsappInstance = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
    };
    this.whatsappInstances.set(id, updated);
    return updated;
  }

  async listWhatsappInstances(): Promise<WhatsappInstance[]> {
    return Array.from(this.whatsappInstances.values());
  }

  async deleteWhatsappInstance(id: string): Promise<boolean> {
    return this.whatsappInstances.delete(id);
  }

  // Messages
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      createdAt: new Date(),
      instanceId: insertMessage.instanceId ?? null,
      messageType: insertMessage.messageType ?? null,
      isFromBot: insertMessage.isFromBot ?? null,
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesByInstance(instanceId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => message.instanceId === instanceId,
    );
  }

  async getMessagesCount(): Promise<number> {
    return this.messages.size;
  }
}

export class DatabaseStorage implements IStorage {
  // Nutritionists
  async getNutritionist(id: string): Promise<Nutritionist | undefined> {
    const [nutritionist] = await db.select().from(nutritionists).where(eq(nutritionists.id, id));
    return nutritionist || undefined;
  }

  async getNutritionistByEmail(email: string): Promise<Nutritionist | undefined> {
    const [nutritionist] = await db.select().from(nutritionists).where(eq(nutritionists.email, email));
    return nutritionist || undefined;
  }

  async createNutritionist(insertNutritionist: InsertNutritionist): Promise<Nutritionist> {
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(insertNutritionist.password, 10);
    
    const [nutritionist] = await db
      .insert(nutritionists)
      .values({ ...insertNutritionist, password: hashedPassword })
      .returning();
    return nutritionist;
  }

  async updateNutritionist(id: string, updateData: Partial<InsertNutritionist>): Promise<Nutritionist | undefined> {
    // Hash password if it's being updated
    let processedUpdateData = { ...updateData };
    if (updateData.password) {
      processedUpdateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const [updated] = await db
      .update(nutritionists)
      .set({ ...processedUpdateData, updatedAt: new Date() })
      .where(eq(nutritionists.id, id))
      .returning();
    return updated || undefined;
  }

  async listNutritionists(): Promise<Nutritionist[]> {
    return await db.select().from(nutritionists);
  }

  async deleteNutritionist(id: string): Promise<boolean> {
    const result = await db.delete(nutritionists).where(eq(nutritionists.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // WhatsApp Instances
  async getWhatsappInstance(id: string): Promise<WhatsappInstance | undefined> {
    const [instance] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.id, id));
    return instance || undefined;
  }

  async getWhatsappInstanceByNutritionist(nutritionistId: string): Promise<WhatsappInstance | undefined> {
    const [instance] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.nutritionistId, nutritionistId));
    return instance || undefined;
  }

  async createWhatsappInstance(insertInstance: InsertWhatsappInstance): Promise<WhatsappInstance> {
    const [instance] = await db
      .insert(whatsappInstances)
      .values(insertInstance)
      .returning();
    return instance;
  }

  async updateWhatsappInstance(id: string, updateData: Partial<InsertWhatsappInstance>): Promise<WhatsappInstance | undefined> {
    const [updated] = await db
      .update(whatsappInstances)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(whatsappInstances.id, id))
      .returning();
    return updated || undefined;
  }

  async listWhatsappInstances(): Promise<WhatsappInstance[]> {
    return await db.select().from(whatsappInstances);
  }

  async deleteWhatsappInstance(id: string): Promise<boolean> {
    const result = await db.delete(whatsappInstances).where(eq(whatsappInstances.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Messages
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async getMessagesByInstance(instanceId: string): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.instanceId, instanceId));
  }

  async getMessagesCount(): Promise<number> {
    const result = await db.select().from(messages);
    return result.length;
  }

  // Patients
  async getPatient(id: string): Promise<Patient | undefined> {
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    return patient || undefined;
  }

  async getPatientsByNutritionist(nutritionistId: string): Promise<Patient[]> {
    return await db.select().from(patients).where(eq(patients.nutritionistId, nutritionistId));
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const [patient] = await db
      .insert(patients)
      .values(insertPatient)
      .returning();
    return patient;
  }

  async updatePatient(id: string, updateData: Partial<InsertPatient>): Promise<Patient | undefined> {
    const [updated] = await db
      .update(patients)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePatient(id: string): Promise<boolean> {
    const result = await db.delete(patients).where(eq(patients.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Consultations
  async getConsultation(id: string): Promise<Consultation | undefined> {
    const [consultation] = await db.select().from(consultations).where(eq(consultations.id, id));
    return consultation || undefined;
  }

  async getConsultationsByPatient(patientId: string): Promise<Consultation[]> {
    return await db.select().from(consultations).where(eq(consultations.patientId, patientId));
  }

  async getConsultationsByNutritionist(nutritionistId: string): Promise<Consultation[]> {
    return await db.select().from(consultations).where(eq(consultations.nutritionistId, nutritionistId));
  }

  async createConsultation(insertConsultation: InsertConsultation): Promise<Consultation> {
    const [consultation] = await db
      .insert(consultations)
      .values(insertConsultation)
      .returning();
    return consultation;
  }

  async updateConsultation(id: string, updateData: Partial<InsertConsultation>): Promise<Consultation | undefined> {
    const [updated] = await db
      .update(consultations)
      .set(updateData)
      .where(eq(consultations.id, id))
      .returning();
    return updated || undefined;
  }
}

// Use DirectusStorage instead of local database
import { DirectusStorage } from './directus-storage';
export const storage = new DirectusStorage();

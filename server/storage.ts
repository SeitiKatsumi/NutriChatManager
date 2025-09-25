import { type Nutritionist, type InsertNutritionist, type WhatsappInstance, type InsertWhatsappInstance, type Message, type InsertMessage, type Patient, type InsertPatient, type Consultation, type InsertConsultation } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

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

  // Subscription Management
  hasActiveSubscription(userId: string): Promise<boolean>;
  getSubscriptionStatus(userId: string): Promise<string | null>;
  updateUserSubscription(userId: string, subscriptionData: {
    stripeCustomerId?: string;
    subscriptionStatus?: string;
    subscriptionId?: string;
    planId?: string;
    subscriptionStartDate?: string;
    subscriptionEndDate?: string;
    trialEndDate?: string;
  }): Promise<any>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<any>;
  updateSubscriptionFromWebhook(stripeCustomerId: string, subscriptionData: {
    subscriptionId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    priceId: string | null;
  }): Promise<void>;
}

export class MemStorage implements IStorage {
  private nutritionists: Map<string, Nutritionist>;
  private whatsappInstances: Map<string, WhatsappInstance>;
  private messages: Map<string, Message>;
  private patients: Map<string, Patient>;
  private consultations: Map<string, Consultation>;

  constructor() {
    this.nutritionists = new Map();
    this.whatsappInstances = new Map();
    this.messages = new Map();
    this.patients = new Map();
    this.consultations = new Map();
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
      address: insertNutritionist.address ?? undefined,
      phone: insertNutritionist.phone ?? undefined,
      specialization: insertNutritionist.specialization ?? undefined,
      whatsappNumber: insertNutritionist.whatsappNumber ?? undefined,
      welcomeMessage: insertNutritionist.welcomeMessage ?? undefined,
      workingHours: insertNutritionist.workingHours ?? undefined,
      status: insertNutritionist.status ?? undefined,
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
      nutritionistId: insertInstance.nutritionistId ?? undefined,
      instanceName: insertInstance.instanceName ?? undefined,
      qrCode: insertInstance.qrCode ?? undefined,
      status: insertInstance.status ?? undefined,
      phoneNumber: insertInstance.phoneNumber ?? undefined,
      agentName: insertInstance.agentName ?? undefined,
      autoResponse: insertInstance.autoResponse ?? undefined,
      config: insertInstance.config ?? undefined,
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

  // Patients
  async getPatient(id: string): Promise<Patient | undefined> {
    return this.patients.get(id);
  }

  async getPatientsByNutritionist(nutritionistId: string): Promise<Patient[]> {
    return Array.from(this.patients.values()).filter(
      (patient) => patient.nutritionistId === nutritionistId,
    );
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const id = randomUUID();
    const now = new Date();
    const patient: Patient = {
      ...insertPatient,
      id,
      createdAt: now,
      updatedAt: now,
      email: insertPatient.email ?? null,
      phone: insertPatient.phone ?? null,
      whatsappNumber: insertPatient.whatsappNumber ?? null,
      dateOfBirth: insertPatient.dateOfBirth ?? null,
      gender: insertPatient.gender ?? null,
      weight: insertPatient.weight ?? null,
      height: insertPatient.height ?? null,
      medicalHistory: insertPatient.medicalHistory ?? null,
      dietaryRestrictions: insertPatient.dietaryRestrictions ?? null,
      goals: insertPatient.goals ?? null,
      status: insertPatient.status ?? 'active',
      lastConsultation: insertPatient.lastConsultation ?? null,
      notes: insertPatient.notes ?? null,
    };
    this.patients.set(id, patient);
    return patient;
  }

  async updatePatient(id: string, updateData: Partial<InsertPatient>): Promise<Patient | undefined> {
    const existing = this.patients.get(id);
    if (!existing) return undefined;

    const updated: Patient = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
    };
    this.patients.set(id, updated);
    return updated;
  }

  async deletePatient(id: string): Promise<boolean> {
    return this.patients.delete(id);
  }

  // Consultations
  async getConsultation(id: string): Promise<Consultation | undefined> {
    return this.consultations.get(id);
  }

  async getConsultationsByPatient(patientId: string): Promise<Consultation[]> {
    return Array.from(this.consultations.values()).filter(
      (consultation) => consultation.patientId === patientId,
    );
  }

  async getConsultationsByNutritionist(nutritionistId: string): Promise<Consultation[]> {
    return Array.from(this.consultations.values()).filter(
      (consultation) => consultation.nutritionistId === nutritionistId,
    );
  }

  async createConsultation(insertConsultation: InsertConsultation): Promise<Consultation> {
    const id = randomUUID();
    const now = new Date();
    const consultation: Consultation = {
      ...insertConsultation,
      id,
      createdAt: now,
      updatedAt: now,
      notes: insertConsultation.notes ?? null,
      diagnosis: insertConsultation.diagnosis ?? null,
      treatment: insertConsultation.treatment ?? null,
    };
    this.consultations.set(id, consultation);
    return consultation;
  }

  async updateConsultation(id: string, updateData: Partial<InsertConsultation>): Promise<Consultation | undefined> {
    const existing = this.consultations.get(id);
    if (!existing) return undefined;

    const updated: Consultation = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
    };
    this.consultations.set(id, updated);
    return updated;
  }

  // Subscription Management (MemStorage implementation)
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const user = await this.getNutritionist(userId);
    if (!user) return false;
    
    // SECURITY: Require active status AND valid subscription ID AND plan ID
    // This prevents users from accessing the app without paying
    const status = (user as any).subscriptionStatus;
    const subscriptionId = (user as any).subscriptionId;
    const planId = (user as any).planId;
    
    const hasActiveStatus = status === 'active';
    const hasValidSubscription = !!(subscriptionId && planId);
    
    return hasActiveStatus && hasValidSubscription;
  }

  async getSubscriptionStatus(userId: string): Promise<string | null> {
    const user = await this.getNutritionist(userId);
    return user ? (user as any).subscriptionStatus || null : null;
  }

  async updateUserSubscription(userId: string, subscriptionData: {
    stripeCustomerId?: string;
    subscriptionStatus?: string;
    subscriptionId?: string;
    planId?: string;
    subscriptionStartDate?: string;
    subscriptionEndDate?: string;
    trialEndDate?: string;
  }): Promise<any> {
    const user = await this.getNutritionist(userId);
    if (!user) return null;

    // Update user with subscription data
    const updatedUser = {
      ...user,
      ...subscriptionData,
      updatedAt: new Date(),
    };
    
    this.nutritionists.set(userId, updatedUser as any);
    return updatedUser;
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<any> {
    const users = Array.from(this.nutritionists.values());
    return users.find((user: any) => user.stripeCustomerId === stripeCustomerId) || null;
  }

  async updateSubscriptionFromWebhook(stripeCustomerId: string, subscriptionData: {
    subscriptionId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    priceId: string | null;
  }): Promise<void> {
    const user = await this.getUserByStripeCustomerId(stripeCustomerId);
    if (!user) {
      console.error(`[MemStorage] User not found for Stripe customer ID: ${stripeCustomerId}`);
      return;
    }

    // Update user with webhook subscription data
    const updatedUser = {
      ...user,
      subscriptionId: subscriptionData.subscriptionId,
      subscriptionStatus: subscriptionData.status,
      planId: subscriptionData.priceId, // Map priceId to planId
      subscriptionStartDate: subscriptionData.currentPeriodStart.toISOString(),
      subscriptionEndDate: subscriptionData.currentPeriodEnd.toISOString(),
      updatedAt: new Date(),
    };
    
    this.nutritionists.set(user.id, updatedUser as any);
    console.log(`[MemStorage] Updated subscription for user ${user.id}: status=${subscriptionData.status}`);
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

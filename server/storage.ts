import { type Nutritionist, type InsertNutritionist, type WhatsappInstance, type InsertWhatsappInstance, type Message, type InsertMessage } from "@shared/schema";
import { randomUUID } from "crypto";

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
    const nutritionist: Nutritionist = {
      ...insertNutritionist,
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

    const updated: Nutritionist = {
      ...existing,
      ...updateData,
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

export const storage = new MemStorage();

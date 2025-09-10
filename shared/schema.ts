import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const nutritionists = pgTable("nutritionists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  crn: text("crn").notNull(), // Professional registration number
  phone: text("phone"),
  address: text("address"),
  specialization: text("specialization"),
  whatsappNumber: text("whatsapp_number"),
  welcomeMessage: text("welcome_message"),
  workingHours: text("working_hours").default("commercial"),
  status: text("status").default("active"), // active, inactive, pending
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const whatsappInstances = pgTable("whatsapp_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nutritionistId: varchar("nutritionist_id").references(() => nutritionists.id),
  instanceId: text("instance_id").notNull().unique(),
  instanceName: text("instance_name"),
  qrCode: text("qr_code"),
  status: text("status").default("disconnected"), // connected, disconnected, connecting
  phoneNumber: text("phone_number"),
  agentName: text("agent_name").default("Assistente NutriBot"),
  autoResponse: boolean("auto_response").default(true),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instanceId: varchar("instance_id").references(() => whatsappInstances.id),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  message: text("message").notNull(),
  messageType: text("message_type").default("text"), // text, image, audio, etc.
  isFromBot: boolean("is_from_bot").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNutritionistSchema = createInsertSchema(nutritionists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWhatsappInstanceSchema = createInsertSchema(whatsappInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertNutritionist = z.infer<typeof insertNutritionistSchema>;
export type Nutritionist = typeof nutritionists.$inferSelect;

export type InsertWhatsappInstance = z.infer<typeof insertWhatsappInstanceSchema>;
export type WhatsappInstance = typeof whatsappInstances.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

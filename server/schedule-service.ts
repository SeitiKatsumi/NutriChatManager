import { twilioWhatsAppService } from "./twilio-whatsapp-service";
import type { WhatsappSchedule, InsertWhatsappSchedule, WhatsappScheduleLog } from "@shared/schema";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "https://nutrichatbot.app.11mind.com.br";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

const SCHEDULES_COLLECTION = "whatsapp_schedules";
const SCHEDULE_LOGS_COLLECTION = "whatsapp_schedule_logs";

interface DirectusSchedule {
  id?: number;
  patient_id: number;
  nutritionist_id: string;
  type: "reactivation" | "meal_feedback" | "post_consultation";
  status: "disabled" | "enabled" | "paused" | "completed";
  message_template?: string;
  config: any;
  next_run_at?: string;
  last_run_at?: string;
  failure_count: number;
  last_error?: string;
  date_created?: string;
  date_updated?: string;
}

interface DirectusScheduleLog {
  id?: number;
  schedule_id: number;
  patient_id: number;
  sent_at: string;
  status: "success" | "failed";
  evolution_message_id?: string;
  error_message?: string;
  message_sent?: string;
  date_created?: string;
}

export class ScheduleService {
  private collectionsInitialized = false;

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${DIRECTUS_URL}${endpoint}`;
    
    const { headers: optionHeaders, ...restOptions } = options;
    
    const response = await fetch(url, {
      ...restOptions,
      headers: {
        "Authorization": `Bearer ${DIRECTUS_TOKEN}`,
        "Content-Type": "application/json",
        ...(optionHeaders as Record<string, string> || {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Directus API Error (${response.status}): ${errorText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }
    return null;
  }

  async ensureCollectionsExist(): Promise<void> {
    if (this.collectionsInitialized) {
      return;
    }

    console.log("[Schedule] Checking if schedule collections exist...");

    try {
      // Check if whatsapp_schedules collection exists
      const schedulesExists = await this.collectionExists(SCHEDULES_COLLECTION);
      if (!schedulesExists) {
        console.log("[Schedule] Creating whatsapp_schedules collection...");
        await this.createSchedulesCollection();
      } else {
        console.log("[Schedule] ✓ whatsapp_schedules collection exists");
      }

      // Check if whatsapp_schedule_logs collection exists
      const logsExists = await this.collectionExists(SCHEDULE_LOGS_COLLECTION);
      if (!logsExists) {
        console.log("[Schedule] Creating whatsapp_schedule_logs collection...");
        await this.createScheduleLogsCollection();
      } else {
        console.log("[Schedule] ✓ whatsapp_schedule_logs collection exists");
      }

      this.collectionsInitialized = true;
      console.log("[Schedule] ✓ All schedule collections ready");
    } catch (error) {
      console.error("[Schedule] Error ensuring collections exist:", error);
      // Don't throw - allow the service to continue with errors being handled per-request
    }
  }

  private async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.request(`/collections/${collectionName}`);
      return true;
    } catch (error: any) {
      if (error.message?.includes("403") || error.message?.includes("404")) {
        return false;
      }
      throw error;
    }
  }

  private async createSchedulesCollection(): Promise<void> {
    // Create the collection
    await this.request("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: SCHEDULES_COLLECTION,
        meta: {
          collection: SCHEDULES_COLLECTION,
          icon: "schedule_send",
          note: "Automated WhatsApp message schedules",
          hidden: false,
          singleton: false,
          accountability: "all"
        },
        schema: {
          name: SCHEDULES_COLLECTION
        }
      }),
    });

    // Create fields
    const fields = [
      {
        field: "id",
        type: "integer",
        meta: { hidden: true, readonly: true, interface: "input" },
        schema: { is_primary_key: true, has_auto_increment: true }
      },
      {
        field: "patient_id",
        type: "integer",
        meta: { interface: "input", required: true, note: "Reference to Cadastro_de_Pacientes" },
        schema: { is_nullable: false }
      },
      {
        field: "nutritionist_id",
        type: "string",
        meta: { interface: "input", required: true, note: "Reference to directus_users" },
        schema: { is_nullable: false }
      },
      {
        field: "type",
        type: "string",
        meta: {
          interface: "select-dropdown",
          required: true,
          options: {
            choices: [
              { text: "Reativação", value: "reactivation" },
              { text: "Feedback de Plano", value: "meal_feedback" },
              { text: "Pós-Consulta", value: "post_consultation" }
            ]
          }
        },
        schema: { is_nullable: false }
      },
      {
        field: "status",
        type: "string",
        meta: {
          interface: "select-dropdown",
          required: true,
          options: {
            choices: [
              { text: "Desabilitado", value: "disabled" },
              { text: "Habilitado", value: "enabled" },
              { text: "Pausado", value: "paused" },
              { text: "Concluído", value: "completed" }
            ]
          }
        },
        schema: { is_nullable: false, default_value: "disabled" }
      },
      {
        field: "message_template",
        type: "text",
        meta: { interface: "input-multiline", note: "Custom message template" },
        schema: { is_nullable: true }
      },
      {
        field: "config",
        type: "json",
        meta: { interface: "input-code", required: true, note: "Schedule configuration" },
        schema: { is_nullable: false }
      },
      {
        field: "next_run_at",
        type: "timestamp",
        meta: { interface: "datetime", note: "Next scheduled run time" },
        schema: { is_nullable: true }
      },
      {
        field: "last_run_at",
        type: "timestamp",
        meta: { interface: "datetime", note: "Last run time" },
        schema: { is_nullable: true }
      },
      {
        field: "failure_count",
        type: "integer",
        meta: { interface: "input", note: "Number of consecutive failures" },
        schema: { is_nullable: false, default_value: 0 }
      },
      {
        field: "last_error",
        type: "text",
        meta: { interface: "input-multiline", note: "Last error message" },
        schema: { is_nullable: true }
      },
      {
        field: "date_created",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, special: ["date-created"] },
        schema: { is_nullable: true }
      },
      {
        field: "date_updated",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, special: ["date-updated"] },
        schema: { is_nullable: true }
      }
    ];

    for (const field of fields) {
      try {
        await this.request(`/fields/${SCHEDULES_COLLECTION}`, {
          method: "POST",
          body: JSON.stringify(field),
        });
        console.log(`[Schedule] ✓ Created field: ${field.field}`);
      } catch (error: any) {
        // Field might already exist
        if (!error.message?.includes("already exists")) {
          console.warn(`[Schedule] Warning creating field ${field.field}:`, error.message);
        }
      }
    }

    console.log("[Schedule] ✓ whatsapp_schedules collection created successfully");
  }

  private async createScheduleLogsCollection(): Promise<void> {
    // Create the collection
    await this.request("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: SCHEDULE_LOGS_COLLECTION,
        meta: {
          collection: SCHEDULE_LOGS_COLLECTION,
          icon: "history",
          note: "Log of sent scheduled messages",
          hidden: false,
          singleton: false,
          accountability: "all"
        },
        schema: {
          name: SCHEDULE_LOGS_COLLECTION
        }
      }),
    });

    // Create fields
    const fields = [
      {
        field: "id",
        type: "integer",
        meta: { hidden: true, readonly: true, interface: "input" },
        schema: { is_primary_key: true, has_auto_increment: true }
      },
      {
        field: "schedule_id",
        type: "integer",
        meta: { interface: "input", required: true, note: "Reference to whatsapp_schedules" },
        schema: { is_nullable: false }
      },
      {
        field: "patient_id",
        type: "integer",
        meta: { interface: "input", required: true, note: "Reference to Cadastro_de_Pacientes" },
        schema: { is_nullable: false }
      },
      {
        field: "sent_at",
        type: "timestamp",
        meta: { interface: "datetime", required: true, note: "When the message was sent" },
        schema: { is_nullable: false }
      },
      {
        field: "status",
        type: "string",
        meta: {
          interface: "select-dropdown",
          required: true,
          options: {
            choices: [
              { text: "Sucesso", value: "success" },
              { text: "Falhou", value: "failed" }
            ]
          }
        },
        schema: { is_nullable: false }
      },
      {
        field: "evolution_message_id",
        type: "string",
        meta: { interface: "input", note: "Provider message ID (Twilio SID)" },
        schema: { is_nullable: true }
      },
      {
        field: "error_message",
        type: "text",
        meta: { interface: "input-multiline", note: "Error message if failed" },
        schema: { is_nullable: true }
      },
      {
        field: "message_sent",
        type: "text",
        meta: { interface: "input-multiline", note: "The actual message content sent" },
        schema: { is_nullable: true }
      },
      {
        field: "date_created",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, special: ["date-created"] },
        schema: { is_nullable: true }
      }
    ];

    for (const field of fields) {
      try {
        await this.request(`/fields/${SCHEDULE_LOGS_COLLECTION}`, {
          method: "POST",
          body: JSON.stringify(field),
        });
        console.log(`[Schedule] ✓ Created field: ${field.field}`);
      } catch (error: any) {
        if (!error.message?.includes("already exists")) {
          console.warn(`[Schedule] Warning creating field ${field.field}:`, error.message);
        }
      }
    }

    console.log("[Schedule] ✓ whatsapp_schedule_logs collection created successfully");
  }

  async getSchedulesByPatient(patientId: number): Promise<WhatsappSchedule[]> {
    try {
      await this.ensureCollectionsExist();
      const result = await this.request(
        `/items/${SCHEDULES_COLLECTION}?filter[patient_id][_eq]=${patientId}`
      );
      return result.data || [];
    } catch (error) {
      console.error("[Schedule] Error getting schedules:", error);
      return [];
    }
  }

  async getSchedulesByNutritionist(nutritionistId: string): Promise<WhatsappSchedule[]> {
    try {
      await this.ensureCollectionsExist();
      // Get all schedules and filter in code due to Directus UUID filter issues
      const result = await this.request(`/items/${SCHEDULES_COLLECTION}`);
      const allSchedules = result.data || [];
      return allSchedules.filter((s: WhatsappSchedule) => s.nutritionist_id === nutritionistId);
    } catch (error) {
      console.error("[Schedule] Error getting schedules:", error);
      return [];
    }
  }

  async getSchedule(id: number): Promise<WhatsappSchedule | null> {
    try {
      await this.ensureCollectionsExist();
      const result = await this.request(`/items/${SCHEDULES_COLLECTION}/${id}`);
      return result.data || null;
    } catch (error) {
      console.error("[Schedule] Error getting schedule:", error);
      return null;
    }
  }

  calculateNextRunAt(type: string, config: any, status: string): string | null {
    if (status !== "enabled") return null;
    
    const now = new Date();
    
    switch (type) {
      case "reactivation":
        if (config?.send_at) {
          return config.send_at;
        }
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        return tomorrow.toISOString();
        
      case "meal_feedback":
        const intervalDays = parseInt(config?.interval_days || "7");
        const startDate = config?.start_date ? new Date(config.start_date) : now;
        const nextFeedback = new Date(startDate);
        nextFeedback.setDate(nextFeedback.getDate() + intervalDays);
        if (nextFeedback <= now) {
          nextFeedback.setTime(now.getTime());
          nextFeedback.setDate(nextFeedback.getDate() + intervalDays);
        }
        nextFeedback.setHours(10, 0, 0, 0);
        return nextFeedback.toISOString();
        
      case "post_consultation":
        const daysAfter = parseInt(config?.days_after || "3");
        const consultationDate = config?.consultation_date ? new Date(config.consultation_date) : now;
        const nextPostConsultation = new Date(consultationDate);
        nextPostConsultation.setDate(nextPostConsultation.getDate() + daysAfter);
        nextPostConsultation.setHours(10, 0, 0, 0);
        return nextPostConsultation.toISOString();
        
      default:
        return null;
    }
  }

  async createSchedule(schedule: InsertWhatsappSchedule): Promise<WhatsappSchedule> {
    await this.ensureCollectionsExist();
    
    const nextRunAt = this.calculateNextRunAt(
      schedule.type, 
      schedule.config, 
      schedule.status || "disabled"
    );
    
    const directusSchedule: Partial<DirectusSchedule> = {
      patient_id: schedule.patient_id,
      nutritionist_id: schedule.nutritionist_id,
      type: schedule.type,
      status: schedule.status || "disabled",
      message_template: schedule.message_template || undefined,
      config: schedule.config,
      next_run_at: nextRunAt || undefined,
      failure_count: 0,
    };

    const result = await this.request(`/items/${SCHEDULES_COLLECTION}`, {
      method: "POST",
      body: JSON.stringify(directusSchedule),
    });

    console.log("[Schedule] Created schedule:", result.data);
    return result.data;
  }

  async updateSchedule(id: number, updates: Partial<WhatsappSchedule>): Promise<WhatsappSchedule | null> {
    try {
      await this.ensureCollectionsExist();
      
      // Only recalculate next_run_at if it wasn't explicitly provided
      // This prevents overwriting the correct value calculated by processSchedules
      const hasExplicitNextRunAt = updates.next_run_at !== undefined;
      
      if (!hasExplicitNextRunAt && (updates.status || updates.config)) {
        const existingSchedule = await this.getSchedule(id);
        if (existingSchedule) {
          const newStatus = updates.status || existingSchedule.status;
          
          // Parse config if it's a string (Directus may return JSON as string)
          let existingConfig = existingSchedule.config;
          if (typeof existingConfig === 'string') {
            try {
              existingConfig = JSON.parse(existingConfig);
            } catch (e) {
              existingConfig = {};
            }
          }
          
          let updatesConfig = updates.config;
          if (typeof updatesConfig === 'string') {
            try {
              updatesConfig = JSON.parse(updatesConfig);
            } catch (e) {
              updatesConfig = undefined;
            }
          }
          
          const newConfig = updatesConfig || existingConfig;
          
          console.log("[Schedule] Calculating next_run_at:", {
            type: existingSchedule.type,
            newConfig,
            newStatus,
            configSendAt: newConfig?.send_at
          });
          
          const newNextRunAt = this.calculateNextRunAt(
            existingSchedule.type,
            newConfig,
            newStatus
          );
          
          console.log("[Schedule] Calculated next_run_at:", newNextRunAt);
          updates.next_run_at = newNextRunAt;
        }
      } else if (hasExplicitNextRunAt) {
        console.log("[Schedule] Using explicit next_run_at:", updates.next_run_at);
      }
      
      const result = await this.request(`/items/${SCHEDULES_COLLECTION}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      console.log("[Schedule] Updated schedule:", result.data);
      return result.data;
    } catch (error) {
      console.error("[Schedule] Error updating schedule:", error);
      return null;
    }
  }

  async deleteSchedule(id: number): Promise<boolean> {
    try {
      await this.ensureCollectionsExist();
      await this.request(`/items/${SCHEDULES_COLLECTION}/${id}`, {
        method: "DELETE",
      });
      console.log("[Schedule] Deleted schedule:", id);
      return true;
    } catch (error) {
      console.error("[Schedule] Error deleting schedule:", error);
      return false;
    }
  }

  async getScheduleLogs(scheduleId: number, limit: number = 50): Promise<WhatsappScheduleLog[]> {
    try {
      await this.ensureCollectionsExist();
      const result = await this.request(
        `/items/${SCHEDULE_LOGS_COLLECTION}?filter[schedule_id][_eq]=${scheduleId}&limit=${limit}&sort=-date_created`
      );
      return result.data || [];
    } catch (error) {
      console.error("[Schedule] Error getting logs:", error);
      return [];
    }
  }

  async createScheduleLog(log: Omit<WhatsappScheduleLog, "id" | "date_created">): Promise<WhatsappScheduleLog> {
    await this.ensureCollectionsExist();
    const result = await this.request(`/items/${SCHEDULE_LOGS_COLLECTION}`, {
      method: "POST",
      body: JSON.stringify(log),
    });
    return result.data;
  }

  async getPendingSchedules(): Promise<WhatsappSchedule[]> {
    try {
      await this.ensureCollectionsExist();
      const now = new Date().toISOString();
      const result = await this.request(
        `/items/${SCHEDULES_COLLECTION}?filter[status][_eq]=enabled&filter[next_run_at][_lte]=${now}`
      );
      return result.data || [];
    } catch (error) {
      console.error("[Schedule] Error getting pending schedules:", error);
      return [];
    }
  }

  // Verifica se já existe um log recente para este schedule (evita duplicatas)
  async hasRecentSuccessLog(scheduleId: number, minutesAgo: number = 5): Promise<boolean> {
    try {
      const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
      const result = await this.request(
        `/items/${SCHEDULE_LOGS_COLLECTION}?filter[schedule_id][_eq]=${scheduleId}&filter[status][_eq]=success&filter[sent_at][_gte]=${cutoffTime}&limit=1`
      );
      const hasRecent = (result.data || []).length > 0;
      if (hasRecent) {
        console.log(`[Scheduler] Schedule ${scheduleId} already has a success log in the last ${minutesAgo} minutes`);
      }
      return hasRecent;
    } catch (error) {
      console.warn("[Schedule] Error checking recent logs:", error);
      return false; // Em caso de erro, permite o envio
    }
  }

  async sendScheduledMessage(
    phoneNumber: string,
    message: string,
    scheduleId: number,
    patientId: number
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`[Schedule] Sending scheduled WhatsApp message to ${phoneNumber} via Twilio`);
      
      const result = await twilioWhatsAppService.sendScheduledWhatsAppText(phoneNumber, message);
      
      await this.createScheduleLog({
        schedule_id: scheduleId,
        patient_id: patientId,
        sent_at: new Date().toISOString(),
        status: "success",
        evolution_message_id: result.sid || null,
        message_sent: message,
        error_message: null,
      });

      return { success: true, messageId: result.sid };
    } catch (error: any) {
      console.error("[Schedule] Error sending message:", error);
      
      try {
        await this.createScheduleLog({
          schedule_id: scheduleId,
          patient_id: patientId,
          sent_at: new Date().toISOString(),
          status: "failed",
          evolution_message_id: null,
          message_sent: message,
          error_message: error.message || "Unknown error",
        });
      } catch (logError) {
        console.error("[Schedule] Error creating log:", logError);
      }

      return { success: false, error: error.message };
    }
  }

  async getDashboardStats(nutritionistId: string): Promise<{
    totalPatients: number;
    activeSchedules: number;
    messagesSentToday: number;
    messagesSentThisWeek: number;
    pendingSchedules: number;
  }> {
    try {
      await this.ensureCollectionsExist();
      const schedules = await this.getSchedulesByNutritionist(nutritionistId);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();
      
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      const weekAgoIso = weekAgo.toISOString();

      let messagesSentToday = 0;
      let messagesSentThisWeek = 0;

      try {
        const todayLogsResult = await this.request(
          `/items/${SCHEDULE_LOGS_COLLECTION}?filter[sent_at][_gte]=${todayIso}&filter[status][_eq]=success&aggregate[count]=*`
        );
        messagesSentToday = todayLogsResult.data?.[0]?.count || 0;

        const weekLogsResult = await this.request(
          `/items/${SCHEDULE_LOGS_COLLECTION}?filter[sent_at][_gte]=${weekAgoIso}&filter[status][_eq]=success&aggregate[count]=*`
        );
        messagesSentThisWeek = weekLogsResult.data?.[0]?.count || 0;
      } catch (e) {
        console.warn("[Schedule] Could not fetch log stats:", e);
      }

      return {
        totalPatients: 0,
        activeSchedules: schedules.filter(s => s.status === "enabled").length,
        messagesSentToday,
        messagesSentThisWeek,
        pendingSchedules: schedules.filter(s => s.status === "enabled" && s.next_run_at).length,
      };
    } catch (error) {
      console.error("[Schedule] Error getting dashboard stats:", error);
      return {
        totalPatients: 0,
        activeSchedules: 0,
        messagesSentToday: 0,
        messagesSentThisWeek: 0,
        pendingSchedules: 0,
      };
    }
  }

  getDefaultMessage(type: "reactivation" | "meal_feedback" | "post_consultation", patientName: string): string {
    const firstName = patientName.split(" ")[0];
    
    switch (type) {
      case "reactivation":
        return `Olá ${firstName}! 👋\n\nEstou passando para lembrar que é importante manter o acompanhamento nutricional em dia.\n\nQue tal agendarmos sua próxima consulta?\n\nAbraços! 🥗`;
      
      case "meal_feedback":
        return `Oi ${firstName}! 😊\n\nComo está sendo sua experiência com o plano alimentar?\n\nEstou aqui para ajudar com qualquer dúvida ou ajuste que precisar!\n\nConta pra mim! 💚`;
      
      case "post_consultation":
        return `Olá ${firstName}! 🌟\n\nComo você está se sentindo depois da nossa consulta?\n\nGostaria de saber se está conseguindo seguir as orientações e se tem alguma dificuldade.\n\nEstou à disposição! 🙏`;
      
      default:
        return `Olá ${firstName}!`;
    }
  }

  private schedulerInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private processingScheduleIds = new Set<number>(); // Lock por schedule ID

  startScheduler(intervalMs: number = 60000): void {
    if (this.schedulerInterval) {
      console.log("[Scheduler] Already running, skipping start");
      return;
    }

    console.log(`[Scheduler] Starting automatic scheduler (interval: ${intervalMs / 1000}s)`);
    
    this.schedulerInterval = setInterval(() => {
      // Primeiro, recuperar schedules travados em "paused"
      this.recoverStuckSchedules().catch(err => {
        console.error("[Scheduler] Error recovering stuck schedules:", err);
      });
      
      // Depois, processar schedules pendentes
      this.processSchedules().catch(err => {
        console.error("[Scheduler] Error processing schedules:", err);
      });
    }, intervalMs);

    this.processSchedules().catch(err => {
      console.error("[Scheduler] Error on initial processing:", err);
    });
  }

  // Watchdog: Recuperar schedules que ficaram travados em "paused" por mais de 10 minutos
  async recoverStuckSchedules(): Promise<void> {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      // Buscar schedules pausados que foram atualizados há mais de 10 minutos
      const result = await this.request(
        `/items/${SCHEDULES_COLLECTION}?filter[status][_eq]=paused`
      );
      const pausedSchedules = (result.data || []) as WhatsappSchedule[];
      
      for (const schedule of pausedSchedules) {
        // Se o schedule está pausado e date_updated é antigo, provavelmente está travado
        if (schedule.date_updated) {
          const updatedAt = new Date(schedule.date_updated);
          const cutoffTime = new Date(Date.now() - 10 * 60 * 1000);
          
          if (updatedAt < cutoffTime) {
            console.log(`[Scheduler] Recovering stuck schedule ${schedule.id} (paused since ${schedule.date_updated})`);
            
            // Restaurar para enabled
            await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "enabled" }),
            });
          }
        }
      }
    } catch (error) {
      console.error("[Scheduler] Error in recoverStuckSchedules:", error);
    }
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log("[Scheduler] Stopped");
    }
  }

  async processSchedules(): Promise<{ processed: number; success: number; failed: number }> {
    if (this.isProcessing) {
      console.log("[Scheduler] Already processing, skipping...");
      return { processed: 0, success: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let success = 0;
    let failed = 0;

    try {
      console.log("[Scheduler] Checking for pending schedules...");
      
      // Buscar apenas schedules habilitados (não "paused" ou processando)
      const allSchedules = await this.request(`/items/${SCHEDULES_COLLECTION}?filter[status][_eq]=enabled`);
      const schedules = (allSchedules.data || []) as WhatsappSchedule[];
      
      const now = new Date();
      const cooldownMinutes = 5; // Cooldown configurável
      const cooldownAgo = new Date(now.getTime() - cooldownMinutes * 60 * 1000);
      
      const pendingSchedules = schedules.filter(s => {
        if (!s.next_run_at) return false;
        
        // PROTEÇÃO 1: Skip se está sendo processado localmente (lock em memória)
        if (this.processingScheduleIds.has(s.id)) {
          console.log(`[Scheduler] Skipping schedule ${s.id} - already being processed (local lock)`);
          return false;
        }
        
        const nextRun = new Date(s.next_run_at);
        const isPastDue = nextRun <= now;
        
        // PROTEÇÃO 2: Skip se last_run_at foi recente (cooldown)
        if (s.last_run_at) {
          const lastRun = new Date(s.last_run_at);
          if (lastRun >= cooldownAgo) {
            console.log(`[Scheduler] Skipping schedule ${s.id} - cooldown: sent ${Math.floor((now.getTime() - lastRun.getTime()) / 1000)}s ago`);
            return false;
          }
        }
        
        if (isPastDue) {
          console.log(`[Scheduler] Schedule ${s.id} is due: next_run_at=${s.next_run_at}, now=${now.toISOString()}`);
        }
        
        return isPastDue;
      });

      console.log(`[Scheduler] Found ${pendingSchedules.length} pending schedules`);

      for (const schedule of pendingSchedules) {
        // Adicionar lock local por ID
        this.processingScheduleIds.add(schedule.id);
        
        try {
          // PROTEÇÃO 3: Double-check - buscar o schedule novamente para verificar status atual
          // Isso reduz a janela de race condition (não é 100% atômico mas é muito mais seguro)
          const freshSchedule = await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`);
          if (!freshSchedule.data || freshSchedule.data.status !== "enabled") {
            console.log(`[Scheduler] Schedule ${schedule.id} is no longer enabled (status: ${freshSchedule.data?.status}), skipping`);
            continue;
          }
          
          // Verificar last_run_at novamente (pode ter sido atualizado por outra instância)
          if (freshSchedule.data.last_run_at) {
            const lastRun = new Date(freshSchedule.data.last_run_at);
            if (lastRun >= cooldownAgo) {
              console.log(`[Scheduler] Schedule ${schedule.id} was recently sent by another instance, skipping`);
              continue;
            }
          }
          
          // PROTEÇÃO 4: Lock persistente - mudar status para "paused" enquanto processa
          const lockResult = await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "paused" }),
          });
          
          if (!lockResult.data) {
            console.warn(`[Scheduler] Could not acquire lock for schedule ${schedule.id}, skipping`);
            continue;
          }
          
          // PROTEÇÃO 5: Verificar log recente no banco (após adquirir lock)
          const hasRecentLog = await this.hasRecentSuccessLog(schedule.id, cooldownMinutes);
          if (hasRecentLog) {
            // Restaurar status enabled e pular
            await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "enabled" }),
            });
            console.log(`[Scheduler] Skipping schedule ${schedule.id} - recent log found`);
            continue;
          }
          
          processed++;
          
          const nutritionist = await this.getNutritionistForSchedule(schedule.nutritionist_id);
          if (!nutritionist) {
            await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "enabled" }),
            });
            console.warn(`[Scheduler] Nutritionist ${schedule.nutritionist_id} not found, skipping`);
            continue;
          }

          if (!twilioWhatsAppService.isConfigured()) {
            await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "enabled" }),
            });
            console.warn("[Scheduler] Twilio WhatsApp is not configured, skipping");
            continue;
          }

          const patient = await this.getPatientForSchedule(schedule.patient_id);
          if (!patient?.whatsappNumber) {
            // Restaurar status
            await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "enabled" }),
            });
            console.warn(`[Scheduler] Patient ${schedule.patient_id} has no WhatsApp, skipping`);
            continue;
          }

          const message = schedule.message_template || 
            this.getDefaultMessage(schedule.type as any, patient.fullName || "Paciente");

          console.log(`[Scheduler] Sending ${schedule.type} message to patient ${schedule.patient_id}`);

          const result = await this.sendScheduledMessage(
            patient.whatsappNumber,
            message,
            schedule.id,
            schedule.patient_id
          );

          if (result.success) {
            success++;
            
            // Calcular próximo run
            const newNextRunAt = this.calculateNextRunAtAfterSend(schedule);
            const isOneShot = schedule.type === "reactivation" || schedule.type === "post_consultation";
            
            // Para schedules one-shot: marcar como "completed"
            // Para recorrentes (meal_feedback): voltar para "enabled" com novo next_run_at
            await this.updateSchedule(schedule.id, {
              last_run_at: new Date().toISOString(),
              next_run_at: newNextRunAt,
              failure_count: 0,
              last_error: null,
              status: isOneShot ? "completed" : "enabled",
            });
            
            console.log(`[Scheduler] Successfully sent to patient ${schedule.patient_id}, next run: ${newNextRunAt || 'completed'}`);
          } else {
            failed++;
            
            // Em caso de falha, restaurar status "enabled" para permitir retry
            await this.updateSchedule(schedule.id, {
              failure_count: (schedule.failure_count || 0) + 1,
              last_error: result.error,
              status: "enabled", // Restaurar para retry
            });
            console.error(`[Scheduler] Failed to send to patient ${schedule.patient_id}: ${result.error}`);
          }
        } catch (error: any) {
          failed++;
          console.error(`[Scheduler] Error processing schedule ${schedule.id}:`, error);
          
          // Tentar restaurar status em caso de erro
          try {
            await this.request(`/items/${SCHEDULES_COLLECTION}/${schedule.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "enabled" }),
            });
          } catch (restoreError) {
            console.error(`[Scheduler] Could not restore status for schedule ${schedule.id}:`, restoreError);
          }
        } finally {
          // Remover lock local
          this.processingScheduleIds.delete(schedule.id);
        }
      }

      console.log(`[Scheduler] Completed - processed: ${processed}, success: ${success}, failed: ${failed}`);
    } catch (error) {
      console.error("[Scheduler] Error in processSchedules:", error);
    } finally {
      this.isProcessing = false;
    }

    return { processed, success, failed };
  }

  private calculateNextRunAtAfterSend(schedule: WhatsappSchedule): string | null {
    switch (schedule.type) {
      case "reactivation":
        return null;
        
      case "meal_feedback":
        const intervalDays = parseInt(schedule.config?.interval_days || "7");
        const nextFeedback = new Date();
        nextFeedback.setDate(nextFeedback.getDate() + intervalDays);
        nextFeedback.setHours(10, 0, 0, 0);
        return nextFeedback.toISOString();
        
      case "post_consultation":
        return null;
        
      default:
        return null;
    }
  }

  private async getNutritionistForSchedule(nutritionistId: string): Promise<any> {
    try {
      const result = await this.request(`/users/${nutritionistId}?fields=id,first_name,last_name`);
      return {
        id: result.data?.id,
        fullName: `${result.data?.first_name || ''} ${result.data?.last_name || ''}`.trim(),
      };
    } catch (error) {
      console.error(`[Scheduler] Error fetching nutritionist ${nutritionistId}:`, error);
      return null;
    }
  }

  private async getPatientForSchedule(patientId: number): Promise<any> {
    try {
      const result = await this.request(`/items/Cadastro_de_Pacientes/${patientId}?fields=id,Nome_Completo,Whatsapp`);
      return {
        id: result.data?.id,
        fullName: result.data?.Nome_Completo,
        whatsappNumber: result.data?.Whatsapp,
      };
    } catch (error) {
      console.error(`[Scheduler] Error fetching patient ${patientId}:`, error);
      return null;
    }
  }
}

export const scheduleService = new ScheduleService();

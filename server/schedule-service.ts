import { evolutionApi } from "./evolution-api";
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

export class ScheduleService {
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

  async getSchedulesByPatient(patientId: number): Promise<WhatsappSchedule[]> {
    try {
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
      const result = await this.request(
        `/items/${SCHEDULES_COLLECTION}?filter[nutritionist_id][_eq]=${nutritionistId}`
      );
      return result.data || [];
    } catch (error) {
      console.error("[Schedule] Error getting schedules:", error);
      return [];
    }
  }

  async getSchedule(id: number): Promise<WhatsappSchedule | null> {
    try {
      const result = await this.request(`/items/${SCHEDULES_COLLECTION}/${id}`);
      return result.data || null;
    } catch (error) {
      console.error("[Schedule] Error getting schedule:", error);
      return null;
    }
  }

  async createSchedule(schedule: InsertWhatsappSchedule): Promise<WhatsappSchedule> {
    const directusSchedule: Partial<DirectusSchedule> = {
      patient_id: schedule.patient_id,
      nutritionist_id: schedule.nutritionist_id,
      type: schedule.type,
      status: schedule.status || "disabled",
      message_template: schedule.message_template || undefined,
      config: schedule.config,
      next_run_at: schedule.next_run_at || undefined,
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
    const result = await this.request(`/items/${SCHEDULE_LOGS_COLLECTION}`, {
      method: "POST",
      body: JSON.stringify(log),
    });
    return result.data;
  }

  async getPendingSchedules(): Promise<WhatsappSchedule[]> {
    try {
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

  async sendScheduledMessage(
    instanceName: string,
    phoneNumber: string,
    message: string,
    scheduleId: number,
    patientId: number
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`[Schedule] Sending message to ${phoneNumber} via ${instanceName}`);
      
      const result = await evolutionApi.sendText(instanceName, phoneNumber, message);
      
      await this.createScheduleLog({
        schedule_id: scheduleId,
        patient_id: patientId,
        sent_at: new Date().toISOString(),
        status: "success",
        evolution_message_id: result.key?.id || null,
        message_sent: message,
        error_message: null,
      });

      return { success: true, messageId: result.key?.id };
    } catch (error: any) {
      console.error("[Schedule] Error sending message:", error);
      
      await this.createScheduleLog({
        schedule_id: scheduleId,
        patient_id: patientId,
        sent_at: new Date().toISOString(),
        status: "failed",
        evolution_message_id: null,
        message_sent: message,
        error_message: error.message || "Unknown error",
      });

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
}

export const scheduleService = new ScheduleService();

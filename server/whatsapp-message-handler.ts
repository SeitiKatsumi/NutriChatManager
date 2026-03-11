import { storage } from './storage';
import { openaiService } from './openai-service';
import { EvolutionApiService } from './evolution-api';
import type { Patient, WhatsappMessage } from '@shared/schema';

export interface IncomingWhatsAppMessage {
  instanceName: string;
  senderNumber: string;
  messageBody: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  imageBuffer?: Buffer;
  timestamp?: number;
}

interface PatientUpdateData {
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  weight?: string;
  height?: string;
  imc?: string;
  idade?: string;
  medicalHistory?: string;
  dietaryRestrictions?: string;
  suplementos_medicamentos?: string;
  goals?: string;
  cafe_da_manha?: string;
  lanche_da_manha?: string;
  almoco?: string;
  lanche_da_tarde?: string;
  janta?: string;
  ceia?: string;
  status?: string;
}

interface CachedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class WhatsAppMessageHandler {
  private patientLocks = new Map<string, Promise<void>>();
  private messageQueue = new Map<string, Promise<void>>();
  private conversationCache = new Map<string, CachedMessage[]>();
  private patientStageCache = new Map<string, { stage: string; updatedAt: number }>();
  private static CACHE_MAX_MESSAGES = 60;
  private static CACHE_TTL_MS = 30 * 60 * 1000;
  private static STAGE_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor() {
    setInterval(() => this.cleanOldCacheEntries(), 5 * 60 * 1000);
  }

  private async withPatientLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.messageQueue.get(key) || Promise.resolve();
    let resolve: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    this.messageQueue.set(key, next);
    await existing;
    try {
      return await fn();
    } finally {
      resolve!();
      if (this.messageQueue.get(key) === next) {
        this.messageQueue.delete(key);
      }
    }
  }

  async handleIncomingMessage(message: IncomingWhatsAppMessage): Promise<void> {
    const { instanceName, senderNumber, messageBody, messageType, imageBuffer } = message;

    console.log(`[MessageHandler] Processing message from ${senderNumber} via instance ${instanceName}`);

    try {
      const nutritionist = await storage.getNutritionistByInstanceName(instanceName);
      if (!nutritionist) {
        console.error(`[MessageHandler] No nutritionist found for instance ${instanceName}`);
        return;
      }

      const nutritionistId = nutritionist.id;
      const cleanNumber = EvolutionApiService.cleanWhatsAppNumber(senderNumber);
      const lockKey = `${nutritionistId}:${cleanNumber}`;

      await this.withPatientLock(lockKey, async () => {
        await this.processMessage(nutritionist, cleanNumber, instanceName, messageBody, messageType, imageBuffer);
      });

    } catch (error) {
      console.error('[MessageHandler] Error processing message:', error);
    }
  }

  private async processMessage(
    nutritionist: any,
    cleanNumber: string,
    instanceName: string,
    messageBody: string,
    messageType: 'text' | 'image' | 'audio' | 'video' | 'document',
    imageBuffer?: Buffer
  ): Promise<void> {
      const nutritionistId = nutritionist.id;

      let patient = await storage.getPatientByWhatsapp(cleanNumber, nutritionistId);
      let isNewPatient = false;

      if (!patient) {
        console.log(`[MessageHandler] Auto-creating patient for ${cleanNumber}`);
        patient = await storage.createPatient({
          nutritionistId,
          fullName: `Paciente ${cleanNumber}`,
          whatsappNumber: cleanNumber,
          status: 'Anamnese Inicial',
        });
        isNewPatient = true;
        console.log(`[MessageHandler] Patient created with ID: ${patient.id}`);
      }

      let aiResponse: string;

      if (messageType === 'image' && imageBuffer) {
        console.log(`[MessageHandler] Processing food image for patient ${patient.id}`);
        await storage.saveWhatsappMessage({
          patient_id: patient.id,
          message_body: messageBody || '[Imagem]',
          from_me: false,
          message_type: 'image',
        });
        try {
          aiResponse = await openaiService.analyzeFood(imageBuffer);
        } catch (err) {
          console.error('[MessageHandler] Error analyzing image:', err);
          aiResponse = 'Desculpe, não consegui analisar essa imagem no momento. Pode tentar enviar novamente?';
        }
      } else if (messageType === 'image' && !imageBuffer) {
        await storage.saveWhatsappMessage({
          patient_id: patient.id,
          message_body: messageBody || '[Imagem sem dados]',
          from_me: false,
          message_type: 'image',
        });
        aiResponse = 'Recebi sua imagem, mas não consegui processá-la. Pode tentar enviar novamente?';
      } else if (messageType === 'audio') {
        await storage.saveWhatsappMessage({
          patient_id: patient.id,
          message_body: '[Áudio]',
          from_me: false,
          message_type: 'audio',
        });
        aiResponse = 'Desculpe, ainda não consigo processar áudios. Pode enviar sua mensagem em texto? 😊';
      } else {
        const conversationHistory = await this.buildConversationHistory(patient.id);

        await storage.saveWhatsappMessage({
          patient_id: patient.id,
          message_body: messageBody || `[${messageType}]`,
          from_me: false,
          message_type: messageType,
        });
        this.addToCache(patient.id, 'user', messageBody || `[${messageType}]`);

        let etapas = patient.status || '';
        const cachedStage = this.patientStageCache.get(patient.id);
        if (cachedStage && (Date.now() - cachedStage.updatedAt) < WhatsAppMessageHandler.STAGE_CACHE_TTL_MS) {
          if (cachedStage.stage === 'Acompanhamento' && etapas === 'Anamnese Inicial') {
            console.log(`[MessageHandler] Overriding Directus stage "${etapas}" with cached stage "${cachedStage.stage}" for patient ${patient.id}`);
            etapas = cachedStage.stage;
          }
        }
        const agentName = nutritionist.nome_do_agente || 'Nutri Chatbot';

        if (etapas === 'Anamnese Inicial' || isNewPatient) {
          aiResponse = await this.handleAnamnesis(
            patient,
            conversationHistory,
            messageBody,
            isNewPatient,
            agentName,
            nutritionist.mensagem_inicial
          );
        } else {
          aiResponse = await this.handleFollowUp(
            patient,
            conversationHistory,
            messageBody,
            agentName
          );
        }
      }

      this.addToCache(patient.id, 'assistant', aiResponse);

      await storage.saveWhatsappMessage({
        patient_id: patient.id,
        message_body: aiResponse,
        from_me: true,
        message_type: 'text',
      });

      try {
        const { baileysService } = await import('./baileys-service.js');
        await baileysService.sendTextByInstanceName(instanceName, cleanNumber, aiResponse);
        console.log(`[MessageHandler] Response sent via Baileys to ${cleanNumber}`);
      } catch (sendErr) {
        console.error(`[MessageHandler] Failed to send message via Baileys to ${cleanNumber}:`, sendErr);
      }
  }

  private async handleAnamnesis(
    patient: Patient,
    conversationHistory: { role: 'user' | 'assistant'; content: string }[],
    messageBody: string,
    isNewPatient: boolean,
    agentName?: string,
    customGreeting?: string
  ): Promise<string> {
    if (isNewPatient && conversationHistory.length === 0) {
      const greeting = customGreeting || `Oi! Eu sou o ${agentName || 'Nutri Chatbot'} 🤖, seu assistente de pré-consulta! Tô aqui pra entender melhor sua rotina, seus objetivos e hábitos, antes da consulta com o nutricionista. Pode falar com liberdade — aqui é sem julgamentos, combinado?\n\nPra começar… o que te motivou a buscar um acompanhamento nutricional?`;

      return greeting;
    }

    const result = await openaiService.runAnamnesisAgent(
      conversationHistory,
      messageBody,
      agentName,
      customGreeting
    );

    if (result.isComplete) {
      console.log(`[MessageHandler] Anamnesis complete for patient ${patient.id}, extracting data...`);
      try {
        const allHistory = [...conversationHistory, { role: 'user' as const, content: messageBody }];
        const extractedData = await openaiService.extractPatientData(allHistory);

        const updateData: PatientUpdateData = {};
        if (extractedData.Nome_Completo) updateData.fullName = extractedData.Nome_Completo;
        if (extractedData.Data_de_nascimento) updateData.dateOfBirth = extractedData.Data_de_nascimento;
        if (extractedData.Sexo) updateData.gender = extractedData.Sexo;
        if (extractedData.Peso) updateData.weight = String(extractedData.Peso);
        if (extractedData.Altura) updateData.height = String(extractedData.Altura);
        if (extractedData.Anamise_inicial) updateData.medicalHistory = extractedData.Anamise_inicial;
        if (extractedData.Restricoes_alimentares) updateData.dietaryRestrictions = extractedData.Restricoes_alimentares;
        if (extractedData.Suplementos_e_medicamentos) updateData.suplementos_medicamentos = extractedData.Suplementos_e_medicamentos;
        if (extractedData.Metas_e_objetivos) updateData.goals = extractedData.Metas_e_objetivos;
        if (extractedData.Cafe_da_manha) updateData.cafe_da_manha = extractedData.Cafe_da_manha;
        if (extractedData.Lanche_da_manha) updateData.lanche_da_manha = extractedData.Lanche_da_manha;
        if (extractedData.Almoco) updateData.almoco = extractedData.Almoco;
        if (extractedData.Lanche_da_tarde) updateData.lanche_da_tarde = extractedData.Lanche_da_tarde;
        if (extractedData.Janta) updateData.janta = extractedData.Janta;
        if (extractedData.Ceia) updateData.ceia = extractedData.Ceia;

        if (extractedData.Peso && extractedData.Altura) {
          const peso = Number(extractedData.Peso);
          const alturaCm = Number(extractedData.Altura);
          if (peso > 0 && alturaCm > 0) {
            const alturaM = alturaCm / 100;
            const imcValue = peso / (alturaM * alturaM);
            const imcRounded = Math.round(imcValue * 10) / 10;
            let classification = '';
            if (imcRounded < 18.5) classification = 'Abaixo do peso';
            else if (imcRounded < 25) classification = 'Peso normal';
            else if (imcRounded < 30) classification = 'Sobrepeso';
            else if (imcRounded < 35) classification = 'Obesidade grau I';
            else if (imcRounded < 40) classification = 'Obesidade grau II';
            else classification = 'Obesidade grau III';
            updateData.imc = `${imcRounded} – ${classification}`;
            console.log(`[MessageHandler] Calculated IMC: ${updateData.imc}`);
          }
        }

        if (extractedData.Data_de_nascimento) {
          try {
            const birth = new Date(extractedData.Data_de_nascimento);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
              age--;
            }
            if (age > 0 && age < 150) {
              updateData.idade = String(age);
              console.log(`[MessageHandler] Calculated age: ${age}`);
            }
          } catch (e) {}
        }

        updateData.status = 'Acompanhamento';

        await storage.updatePatient(patient.id, updateData);
        this.patientStageCache.set(patient.id, { stage: 'Acompanhamento', updatedAt: Date.now() });
        console.log(`[MessageHandler] Patient ${patient.id} updated with anamnesis data, stage set to Acompanhamento (cached)`);
      } catch (extractErr) {
        console.error('[MessageHandler] Error extracting/saving anamnesis data:', extractErr);
      }
    }

    return result.response;
  }

  private async handleFollowUp(
    patient: Patient,
    conversationHistory: { role: 'user' | 'assistant'; content: string }[],
    messageBody: string,
    agentName?: string
  ): Promise<string> {
    let patientData: Patient = patient;

    if (patient.id) {
      try {
        const freshData = await storage.getPatient(patient.id);
        if (freshData) patientData = freshData;
      } catch (e) {
        console.warn('[MessageHandler] Could not refresh patient data, using cached');
      }
    }

    return openaiService.runFollowUpAgent(patientData, conversationHistory, messageBody, agentName);
  }

  private addToCache(patientId: string, role: 'user' | 'assistant', content: string): void {
    const cached = this.conversationCache.get(patientId) || [];
    cached.push({ role, content, timestamp: Date.now() });
    if (cached.length > WhatsAppMessageHandler.CACHE_MAX_MESSAGES) {
      cached.splice(0, cached.length - WhatsAppMessageHandler.CACHE_MAX_MESSAGES);
    }
    this.conversationCache.set(patientId, cached);
  }

  private cleanOldCacheEntries(): void {
    const now = Date.now();
    for (const [patientId, messages] of this.conversationCache.entries()) {
      const fresh = messages.filter(m => now - m.timestamp < WhatsAppMessageHandler.CACHE_TTL_MS);
      if (fresh.length === 0) {
        this.conversationCache.delete(patientId);
      } else {
        this.conversationCache.set(patientId, fresh);
      }
    }
    for (const [patientId, entry] of this.patientStageCache.entries()) {
      if (now - entry.updatedAt > WhatsAppMessageHandler.STAGE_CACHE_TTL_MS) {
        this.patientStageCache.delete(patientId);
      }
    }
  }

  private async buildConversationHistory(
    patientId: string,
    limit: number = 50
  ): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    try {
      const directusMessages = await storage.getPatientMessages(patientId, limit);

      const directusHistory: { role: 'user' | 'assistant'; content: string; timestamp: number }[] = [];
      if (directusMessages && directusMessages.length > 0) {
        for (const msg of directusMessages) {
          if (!msg.message_body || !msg.message_body.trim()) continue;
          const ts = msg.date_created instanceof Date ? msg.date_created.getTime() : new Date(msg.date_created || 0).getTime();
          directusHistory.push({
            role: msg.from_me ? 'assistant' as const : 'user' as const,
            content: msg.message_body,
            timestamp: ts,
          });
        }
      }

      const cached = this.conversationCache.get(patientId) || [];

      const contentSet = new Set(directusHistory.map(m => `${m.role}:${m.content.substring(0, 100)}`));
      const merged = [...directusHistory];
      for (const cm of cached) {
        const key = `${cm.role}:${cm.content.substring(0, 100)}`;
        if (!contentSet.has(key)) {
          merged.push(cm);
          contentSet.add(key);
        }
      }

      merged.sort((a, b) => a.timestamp - b.timestamp);

      const result = merged.slice(-limit).map(m => ({ role: m.role, content: m.content }));

      console.log(`[MessageHandler] Built history for patient ${patientId}: ${directusHistory.length} from Directus, ${cached.length} from cache, ${result.length} merged`);

      return result;
    } catch (error) {
      console.error('[MessageHandler] Error building conversation history:', error);
      const cached = this.conversationCache.get(patientId) || [];
      if (cached.length > 0) {
        console.log(`[MessageHandler] Falling back to cache: ${cached.length} messages`);
        return cached.map(m => ({ role: m.role, content: m.content }));
      }
      return [];
    }
  }
}

export const whatsappMessageHandler = new WhatsAppMessageHandler();

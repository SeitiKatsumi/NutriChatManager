import { storage } from './storage';
import { openaiService } from './openai-service';
import { twilioWhatsAppService } from './twilio-whatsapp-service';
import type { Patient, WhatsappMessage } from '@shared/schema';
import { randomUUID } from 'crypto';

const GHOST_NUTRITIONIST_EMAIL = 'nutricionista.fantasma@nutrichatbot.local';
const GHOST_NUTRITIONIST_NAME = 'Nutricionista Fantasma';
const GHOST_GREETING = 'Oi! Você já tem um nutricionista responsável vinculado ao NutriChatbot? Se souber, me diga o nome dele. Se não souber ou ainda não tiver, tudo bem: vou continuar seu cadastro por aqui.';

function cleanWhatsAppNumber(whatsappNumber: string): string {
  const cleaned = whatsappNumber.replace(/\D/g, '');
  if ((cleaned.length === 10 || cleaned.length === 11) && !cleaned.startsWith('55')) {
    return '55' + cleaned;
  }
  return cleaned;
}

export interface IncomingWhatsAppMessage {
  instanceName?: string;
  nutritionistId?: string;
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

type ExtractedPatientData = Awaited<ReturnType<typeof openaiService.extractPatientData>>;

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
    const { instanceName, nutritionistId: explicitNutritionistId, senderNumber, messageBody, messageType, imageBuffer } = message;
    const channelIdentity = instanceName || 'twilio-global-whatsapp';

    console.log(`[MessageHandler] Processing message from ${senderNumber} via ${channelIdentity}`);

    try {
      const cleanNumber = cleanWhatsAppNumber(senderNumber);

      let nutritionist: any | undefined;
      let resolvedPatient: Patient | undefined;

      if (explicitNutritionistId) {
        nutritionist = await storage.getNutritionist(explicitNutritionistId);
      } else {
        resolvedPatient = await storage.getPatientByWhatsappAny(cleanNumber);
        if (resolvedPatient?.nutritionistId) {
          nutritionist = await storage.getNutritionist(resolvedPatient.nutritionistId);
        }
      }

      if (!nutritionist) {
        nutritionist = await this.getGhostNutritionist();
      }

      const nutritionistId = nutritionist.id;

      if (!this.isValidPhoneNumber(cleanNumber)) {
        console.log(`[MessageHandler] Ignoring message from invalid/non-Brazilian number: ${cleanNumber}`);
        return;
      }

      const lockKey = `${nutritionistId}:${cleanNumber}`;

      await this.withPatientLock(lockKey, async () => {
        await this.processMessage(nutritionist, cleanNumber, channelIdentity, messageBody, messageType, imageBuffer, resolvedPatient);
      });

    } catch (error) {
      console.error('[MessageHandler] Error processing message:', error);
    }
  }

  private async processMessage(
    nutritionist: any,
    cleanNumber: string,
    channelIdentity: string,
    messageBody: string,
    messageType: 'text' | 'image' | 'audio' | 'video' | 'document',
    imageBuffer?: Buffer,
    resolvedPatient?: Patient
  ): Promise<void> {
      const nutritionistId = nutritionist.id;

      let patient = resolvedPatient || await storage.getPatientByWhatsapp(cleanNumber, nutritionistId);
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
        if (!patient) {
          throw new Error(`Failed to create patient for WhatsApp ${cleanNumber}`);
        }
        console.log(`[MessageHandler] Patient created with ID: ${patient.id}`);
      }

      if (!patient) {
        throw new Error(`Failed to resolve patient for WhatsApp ${cleanNumber}`);
      }

      let activePatient: Patient = patient;

      if (activePatient.nutritionistId === nutritionistId && this.isGhostNutritionist(nutritionist) && messageType === 'text') {
        const matchedNutritionist = await this.findNutritionistByName(messageBody);
        if (matchedNutritionist) {
          const updatedPatient = await storage.updatePatient(activePatient.id, { nutritionistId: matchedNutritionist.id });
          activePatient = updatedPatient || { ...activePatient, nutritionistId: matchedNutritionist.id };
          nutritionist = matchedNutritionist;
          console.log(`[MessageHandler] Patient ${activePatient.id} assigned to nutritionist ${matchedNutritionist.id} from WhatsApp message`);
        }
      }

      let aiResponse: string;

      if (messageType === 'image' && imageBuffer) {
        console.log(`[MessageHandler] Processing food image for patient ${activePatient.id}`);
        await storage.saveWhatsappMessage({
          patient_id: activePatient.id,
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
          patient_id: activePatient.id,
          message_body: messageBody || '[Imagem sem dados]',
          from_me: false,
          message_type: 'image',
        });
        aiResponse = 'Recebi sua imagem, mas não consegui processá-la. Pode tentar enviar novamente?';
      } else if (messageType === 'audio') {
        await storage.saveWhatsappMessage({
          patient_id: activePatient.id,
          message_body: '[Áudio]',
          from_me: false,
          message_type: 'audio',
        });
        aiResponse = 'Desculpe, ainda não consigo processar áudios. Pode enviar sua mensagem em texto? 😊';
      } else {
        const conversationHistory = await this.buildConversationHistory(activePatient.id);

        await storage.saveWhatsappMessage({
          patient_id: activePatient.id,
          message_body: messageBody || `[${messageType}]`,
          from_me: false,
          message_type: messageType,
        });
        this.addToCache(activePatient.id, 'user', messageBody || `[${messageType}]`);

        let etapas = activePatient.status || '';
        const cachedStage = this.patientStageCache.get(activePatient.id);
        if (cachedStage && (Date.now() - cachedStage.updatedAt) < WhatsAppMessageHandler.STAGE_CACHE_TTL_MS) {
          if (cachedStage.stage === 'Acompanhamento' && etapas === 'Anamnese Inicial') {
            console.log(`[MessageHandler] Overriding Directus stage "${etapas}" with cached stage "${cachedStage.stage}" for patient ${activePatient.id}`);
            etapas = cachedStage.stage;
          }
        }
        const agentName = nutritionist.nome_do_agente || 'Nutri Chatbot';
        const customGreeting = this.isGhostNutritionist(nutritionist) ? GHOST_GREETING : nutritionist.mensagem_inicial;

        if (etapas === 'Anamnese Inicial' || isNewPatient) {
          aiResponse = await this.handleAnamnesis(
            activePatient,
            conversationHistory,
            messageBody,
            isNewPatient,
            agentName,
            customGreeting
          );
        } else {
          aiResponse = await this.handleFollowUp(
            activePatient,
            conversationHistory,
            messageBody,
            agentName
          );
        }
      }

      this.addToCache(activePatient.id, 'assistant', aiResponse);

      await storage.saveWhatsappMessage({
        patient_id: activePatient.id,
        message_body: aiResponse,
        from_me: true,
        message_type: 'text',
      });

      try {
        await twilioWhatsAppService.sendWhatsAppText(cleanNumber, aiResponse);
        console.log(`[MessageHandler] Response sent via Twilio to ${cleanNumber} (${channelIdentity})`);
      } catch (sendErr) {
        console.error(`[MessageHandler] Failed to send message via Twilio to ${cleanNumber}:`, sendErr);
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
        const anamnesisParts = [
          extractedData.Anamise_inicial,
          extractedData.Metas_e_objetivos ? `Objetivos nutricionais: ${extractedData.Metas_e_objetivos}` : undefined,
        ].filter(Boolean);
        if (anamnesisParts.length) updateData.medicalHistory = anamnesisParts.join('\n\n');
        if (extractedData.Restricoes_alimentares) updateData.dietaryRestrictions = extractedData.Restricoes_alimentares;
        if (extractedData.Suplementos_e_medicamentos) updateData.suplementos_medicamentos = extractedData.Suplementos_e_medicamentos;
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

        const missingFields = this.getMissingRequiredAnamnesisFields(patient, extractedData, updateData);
        if (missingFields.length > 0) {
          if (Object.keys(updateData).length > 0) {
            await storage.updatePatient(patient.id, updateData);
          }
          console.log(`[MessageHandler] Anamnesis completion blocked for patient ${patient.id}; missing fields: ${missingFields.join(', ')}`);
          return this.buildMissingAnamnesisMessage(missingFields);
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

  private async getGhostNutritionist(): Promise<any> {
    const existing = await storage.getNutritionistByEmail(GHOST_NUTRITIONIST_EMAIL);
    if (existing) return existing;

    return storage.createNutritionist({
      fullName: GHOST_NUTRITIONIST_NAME,
      email: GHOST_NUTRITIONIST_EMAIL,
      password: randomUUID(),
      cpfCnpj: '00000000000',
      status: 'active',
      status_pagamento: 'ativo',
      subscriptionStatus: 'active',
      nome_do_agente: 'NutriChatbot',
      mensagem_inicial: GHOST_GREETING,
    } as any);
  }

  private isGhostNutritionist(nutritionist: any): boolean {
    return nutritionist?.email === GHOST_NUTRITIONIST_EMAIL;
  }

  private async findNutritionistByName(messageBody: string): Promise<any | undefined> {
    const wanted = this.normalizeName(messageBody);
    if (wanted.length < 4 || /^(nao|não|n sei|nao sei|não sei|nenhum|nao tenho|não tenho)\b/.test(wanted)) {
      return undefined;
    }

    const nutritionists = await storage.listNutritionists();
    return nutritionists.find((n: any) => {
      if (this.isGhostNutritionist(n)) return false;
      const name = this.normalizeName(n.fullName || '');
      return name.length >= 4 && (wanted.includes(name) || name.includes(wanted));
    });
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getMissingRequiredAnamnesisFields(
    patient: Patient,
    extractedData: ExtractedPatientData,
    updateData: PatientUpdateData
  ): string[] {
    const patientName = String(patient.fullName || '').trim();
    const hasUsableExistingName = !!patientName && !/^Paciente\s+\d+$/i.test(patientName);

    const required: Array<[boolean, string]> = [
      [!!(extractedData.Nome_Completo || updateData.fullName || hasUsableExistingName), 'nome completo'],
      [!!(extractedData.Data_de_nascimento || updateData.dateOfBirth || patient.dateOfBirth), 'data de nascimento'],
      [!!(extractedData.Sexo || updateData.gender || patient.gender), 'sexo'],
      [!!(extractedData.Peso || updateData.weight || patient.weight), 'peso atual'],
      [!!(extractedData.Altura || updateData.height || patient.height), 'altura'],
      [!!(extractedData.Cafe_da_manha || updateData.cafe_da_manha || patient.cafe_da_manha), 'café da manhã'],
      [!!(extractedData.Lanche_da_manha || updateData.lanche_da_manha || patient.lanche_da_manha), 'lanche da manhã'],
      [!!(extractedData.Almoco || updateData.almoco || patient.almoco), 'almoço'],
      [!!(extractedData.Lanche_da_tarde || updateData.lanche_da_tarde || patient.lanche_da_tarde), 'lanche da tarde'],
      [!!(extractedData.Janta || updateData.janta || patient.janta), 'jantar'],
    ];

    return required.filter(([hasValue]) => !hasValue).map(([, label]) => label);
  }

  private buildMissingAnamnesisMessage(missingFields: string[]): string {
    const fields = missingFields.join(', ');
    return `Quase lá. Antes de finalizar a anamnese, preciso completar: ${fields}.\n\nPode me mandar esses dados em uma única mensagem?`;
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

  private isValidPhoneNumber(number: string): boolean {
    const digits = number.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return false;
    if (digits.startsWith('55')) {
      return digits.length === 12 || digits.length === 13;
    }
    if (/^[1-9]\d{9,14}$/.test(digits)) {
      return true;
    }
    return false;
  }

  private cleanOldCacheEntries(): void {
    const now = Date.now();
    for (const [patientId, messages] of Array.from(this.conversationCache.entries())) {
      const fresh = messages.filter((m: CachedMessage) => now - m.timestamp < WhatsAppMessageHandler.CACHE_TTL_MS);
      if (fresh.length === 0) {
        this.conversationCache.delete(patientId);
      } else {
        this.conversationCache.set(patientId, fresh);
      }
    }
    for (const [patientId, entry] of Array.from(this.patientStageCache.entries())) {
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

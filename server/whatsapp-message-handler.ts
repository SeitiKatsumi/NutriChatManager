import { storage } from './storage';
import { openaiService } from './openai-service';
import { evolutionApi, EvolutionApiService } from './evolution-api';
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

export class WhatsAppMessageHandler {

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

        const etapas = patient.status || '';
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

      await storage.saveWhatsappMessage({
        patient_id: patient.id,
        message_body: aiResponse,
        from_me: true,
        message_type: 'text',
      });

      try {
        await evolutionApi.sendText(instanceName, cleanNumber, aiResponse);
        console.log(`[MessageHandler] Response sent to ${cleanNumber}`);
      } catch (sendErr) {
        console.error(`[MessageHandler] Failed to send message to ${cleanNumber}:`, sendErr);
      }

    } catch (error) {
      console.error('[MessageHandler] Error processing message:', error);
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

        updateData.status = 'Acompanhamento';

        await storage.updatePatient(patient.id, updateData);
        console.log(`[MessageHandler] Patient ${patient.id} updated with anamnesis data, stage set to Acompanhamento`);
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

  private async buildConversationHistory(
    patientId: string,
    limit: number = 30
  ): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    try {
      const messages = await storage.getPatientMessages(patientId, limit);
      if (!messages || messages.length === 0) return [];

      const sorted = [...messages].sort((a, b) => {
        const timeA = a.date_created instanceof Date ? a.date_created.getTime() : new Date(a.date_created || 0).getTime();
        const timeB = b.date_created instanceof Date ? b.date_created.getTime() : new Date(b.date_created || 0).getTime();
        return timeA - timeB;
      });

      return sorted
        .filter((msg) => msg.message_body && msg.message_body.trim())
        .map((msg) => ({
          role: msg.from_me ? 'assistant' as const : 'user' as const,
          content: msg.message_body,
        }));
    } catch (error) {
      console.error('[MessageHandler] Error building conversation history:', error);
      return [];
    }
  }
}

export const whatsappMessageHandler = new WhatsAppMessageHandler();

import { storage } from './storage';

export interface ProcessedMessage {
  id: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
  type: 'text' | 'image' | 'audio' | 'unknown';
}

export class PatientHistoryDirectusService {
  /**
   * Get patient messages from Directus collection by patient ID
   * Converts WhatsappMessage[] to ProcessedMessage[] format
   */
  async getPatientMessages(
    patientId: string, 
    limit?: number
  ): Promise<ProcessedMessage[]> {
    try {
      console.log(`[Patient History Directus] Fetching messages for patient ID: ${patientId}, limit: ${limit || 200}`);
      
      const whatsappMessages = await storage.getPatientMessages(patientId, limit);
      
      if (!whatsappMessages || whatsappMessages.length === 0) {
        console.log(`[Patient History Directus] No messages found for patient ID: ${patientId}`);
        return [];
      }
      
      // Convert WhatsappMessage[] to ProcessedMessage[]
      const processedMessages: ProcessedMessage[] = whatsappMessages.map((msg, index) => {
        let messageType: 'text' | 'image' | 'audio' | 'unknown' = 'text';
        if (msg.message_type === 'image') messageType = 'image';
        else if (msg.message_type === 'audio') messageType = 'audio';
        else if (msg.message_type !== 'text') messageType = 'unknown';
        
        return {
          id: String(msg.id || `msg_${index}`),
          text: msg.message_body || '',
          timestamp: msg.date_created instanceof Date ? msg.date_created.getTime() : new Date(msg.date_created).getTime(),
          fromMe: msg.from_me !== true,
          type: messageType,
        };
      });
      
      // Sort by timestamp (oldest first)
      processedMessages.sort((a, b) => a.timestamp - b.timestamp);
      
      console.log(`[Patient History Directus] Processed ${processedMessages.length} messages for patient ${patientId}`);
      return processedMessages;
    } catch (error) {
      console.error('[Patient History Directus] Error fetching patient messages:', error);
      return [];
    }
  }
}

export const patientHistoryDirectus = new PatientHistoryDirectusService();

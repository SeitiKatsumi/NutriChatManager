import { storage } from './storage';

export interface ProcessedMessage {
  id: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
  type: 'text' | 'image' | 'audio' | 'unknown';
  phoneNumber: string;
}

export class PatientHistoryDirectusService {
  /**
   * Get patient messages from Directus collection
   * Converts WhatsappMessage[] to ProcessedMessage[] format
   */
  async getPatientMessages(
    nutritionistId: string, 
    phoneNumber: string, 
    limit?: number
  ): Promise<ProcessedMessage[]> {
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      console.log(`[Patient History Directus] Fetching messages for phone: ***${cleanPhone.slice(-4)}, limit: ${limit || 200}`);
      
      // Try to get messages by phone number (when patient not identified yet)
      const whatsappMessages = await storage.getPatientMessagesByPhone(cleanPhone, limit);
      
      if (!whatsappMessages || whatsappMessages.length === 0) {
        console.log(`[Patient History Directus] No messages found for phone: ***${cleanPhone.slice(-4)}`);
        return [];
      }
      
      // Convert WhatsappMessage[] to ProcessedMessage[]
      const processedMessages: ProcessedMessage[] = whatsappMessages.map((msg, index) => {
        // Determine message type based on message_type field
        let messageType: 'text' | 'image' | 'audio' | 'unknown' = 'text';
        if (msg.message_type === 'image') messageType = 'image';
        else if (msg.message_type === 'audio') messageType = 'audio';
        else if (msg.message_type !== 'text') messageType = 'unknown';
        
        return {
          id: String(msg.id || `msg_${index}`),
          text: msg.message_body || '',
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : new Date(msg.timestamp).getTime(),
          fromMe: msg.from_me === true,
          type: messageType,
          phoneNumber: msg.phone_number || cleanPhone
        };
      });
      
      // Sort by timestamp (oldest first)
      processedMessages.sort((a, b) => a.timestamp - b.timestamp);
      
      console.log(`[Patient History Directus] Processed ${processedMessages.length} messages for patient ***${cleanPhone.slice(-4)}`);
      return processedMessages;
    } catch (error) {
      console.error('[Patient History Directus] Error fetching patient messages:', error);
      return [];
    }
  }

  /**
   * Get patient messages by patient ID
   * Used when we have the patient record already linked
   */
  async getPatientMessagesByPatientId(
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
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : new Date(msg.timestamp).getTime(),
          fromMe: msg.from_me === true,
          type: messageType,
          phoneNumber: msg.phone_number || ''
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

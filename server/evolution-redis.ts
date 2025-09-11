import { createClient } from 'redis';

export interface EvolutionMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
    imageMessage?: {
      caption?: string;
    };
    audioMessage?: any;
  };
  messageTimestamp: string;
  status?: string;
}

export interface ProcessedMessage {
  id: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
  type: 'text' | 'image' | 'audio' | 'unknown';
  phoneNumber: string;
}

export class EvolutionRedisService {
  private redis: any;
  private prefix = 'evolution-api:';
  private connected = false;

  constructor() {
    this.redis = createClient({
      socket: {
        host: 'srv-captain--nutrichatbot-evolution-redis',
        port: 6379
      }
    });

    this.redis.on('error', (err: any) => {
      console.error('[Evolution Redis] Connection error:', err);
      this.connected = false;
    });

    this.redis.on('connect', () => {
      console.log('[Evolution Redis] Connected successfully');
      this.connected = true;
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    
    try {
      await this.redis.connect();
      console.log('[Evolution Redis] Connection established');
    } catch (error) {
      console.error('[Evolution Redis] Failed to connect:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis && this.connected) {
      await this.redis.disconnect();
      this.connected = false;
    }
  }

  private extractMessageText(message: EvolutionMessage['message']): string {
    if (message.conversation) {
      return message.conversation;
    }
    
    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text;
    }
    
    if (message.imageMessage?.caption) {
      return `[Imagem] ${message.imageMessage.caption}`;
    }
    
    if (message.audioMessage) {
      return '[Áudio]';
    }
    
    return '[Mensagem]';
  }

  private getMessageType(message: EvolutionMessage['message']): 'text' | 'image' | 'audio' | 'unknown' {
    if (message.conversation || message.extendedTextMessage) {
      return 'text';
    }
    
    if (message.imageMessage) {
      return 'image';
    }
    
    if (message.audioMessage) {
      return 'audio';
    }
    
    return 'unknown';
  }

  async getPatientMessages(
    nutritionistId: string, 
    phoneNumber: string, 
    limit: number = 100
  ): Promise<ProcessedMessage[]> {
    await this.connect();
    
    try {
      const instanceName = `nutri_${nutritionistId}`;
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const whatsappJid = `${cleanPhone}@s.whatsapp.net`;
      
      const key = `${this.prefix}instance:${instanceName}:chat:${whatsappJid}:messages`;
      
      console.log(`[Evolution Redis] Searching messages for nutritionist ${nutritionistId}`);
      
      // Use ZRANGE with REV option to get newest messages first
      const messages = await this.redis.zRange(key, 0, limit - 1, {
        REV: true
      });
      
      console.log(`[Evolution Redis] Found ${messages.length} raw messages`);
      
      const processedMessages: ProcessedMessage[] = [];
      
      for (const messageStr of messages) {
        try {
          const evolutionMsg: EvolutionMessage = JSON.parse(messageStr);
          
          const processedMsg: ProcessedMessage = {
            id: evolutionMsg.key.id,
            text: this.extractMessageText(evolutionMsg.message),
            timestamp: parseInt(evolutionMsg.messageTimestamp) * 1000, // Convert to milliseconds
            fromMe: evolutionMsg.key.fromMe,
            type: this.getMessageType(evolutionMsg.message),
            phoneNumber: cleanPhone
          };
          
          processedMessages.push(processedMsg);
        } catch (parseError) {
          console.error('[Evolution Redis] Error parsing message:', parseError);
        }
      }
      
      console.log(`[Evolution Redis] Processed ${processedMessages.length} messages for patient ***${phoneNumber.slice(-4)}`);
      return processedMessages;
    } catch (error) {
      console.error('[Evolution Redis] Error fetching patient messages:', error);
      throw error;
    }
  }

  async getNutritionistPatients(nutritionistId: string): Promise<string[]> {
    await this.connect();
    
    try {
      const instanceName = `nutri_${nutritionistId}`;
      const pattern = `${this.prefix}instance:${instanceName}:chat:*:messages`;
      
      console.log(`[Evolution Redis] Scanning for patients for nutritionist ${nutritionistId}`);
      
      const keys = await this.redis.keys(pattern);
      
      const phoneNumbers = keys.map((key: string) => {
        // Extract phone number from: evolution-api:instance:nutri_123:chat:5511999999999@s.whatsapp.net:messages
        const match = key.match(/:chat:(\d+)@s\.whatsapp\.net:messages$/);
        return match ? match[1] : null;
      }).filter(Boolean);
      
      console.log(`[Evolution Redis] Found ${phoneNumbers.length} patients for nutritionist ${nutritionistId}`);
      return phoneNumbers;
    } catch (error) {
      console.error('[Evolution Redis] Error fetching nutritionist patients:', error);
      throw error;
    }
  }

  async getConversationSummary(
    nutritionistId: string, 
    phoneNumber: string, 
    days: number = 7
  ): Promise<{ totalMessages: number; lastMessageTime: number; messagesByDay: Record<string, number> }> {
    const messages = await this.getPatientMessages(nutritionistId, phoneNumber, 1000);
    
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentMessages = messages.filter(msg => msg.timestamp > cutoffTime);
    
    const messagesByDay: Record<string, number> = {};
    recentMessages.forEach(msg => {
      const day = new Date(msg.timestamp).toISOString().split('T')[0];
      messagesByDay[day] = (messagesByDay[day] || 0) + 1;
    });
    
    return {
      totalMessages: recentMessages.length,
      lastMessageTime: Math.max(...messages.map(msg => msg.timestamp), 0),
      messagesByDay
    };
  }
}

// Create singleton instance
export const evolutionRedis = new EvolutionRedisService();
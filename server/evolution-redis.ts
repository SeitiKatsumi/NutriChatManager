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
    // Use environment variables or fallback to localhost for development
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        connectTimeout: 5000,
        lazyConnect: true
      },
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME
    };

    console.log('[Evolution Redis] Connecting to:', redisConfig.socket.host + ':' + redisConfig.socket.port);
    this.redis = createClient(redisConfig);

    this.redis.on('error', (err: any) => {
      console.error('[Evolution Redis] Connection error:', err);
      this.connected = false;
    });

    this.redis.on('connect', () => {
      console.log('[Evolution Redis] Connected successfully');
      this.connected = true;
    });

    this.redis.on('ready', () => {
      console.log('[Evolution Redis] Redis ready for commands');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    
    try {
      // Add timeout to prevent hanging
      const connectTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      );
      
      await Promise.race([this.redis.connect(), connectTimeout]);
      console.log('[Evolution Redis] Connection established');
      this.connected = true;
    } catch (error) {
      console.error('[Evolution Redis] Failed to connect:', error);
      console.log('[Evolution Redis] Running in mock mode for development');
      this.connected = false; // Keep connected false to trigger mock mode
      // Don't throw error to allow graceful fallback
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
    
    // If not connected, return mock data for development
    if (!this.connected) {
      console.log('[Evolution Redis] Using mock data for development');
      return this.getMockPatientMessages(phoneNumber);
    }
    
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
      // Return mock data on error
      console.log('[Evolution Redis] Falling back to mock data due to error');
      return this.getMockPatientMessages(phoneNumber);
    }
  }

  private getMockPatientMessages(phoneNumber: string): ProcessedMessage[] {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    return [
      {
        id: 'mock_1',
        text: 'Oi, doutora! Como está?',
        timestamp: now - (6 * oneHour),
        fromMe: false,
        type: 'text',
        phoneNumber: phoneNumber.replace(/\D/g, '')
      },
      {
        id: 'mock_2',
        text: 'Olá! Estou bem, obrigada por perguntar. Como você está se sentindo com a nova dieta?',
        timestamp: now - (5 * oneHour + 30 * 60000),
        fromMe: true,
        type: 'text',
        phoneNumber: phoneNumber.replace(/\D/g, '')
      },
      {
        id: 'mock_3',
        text: 'Estou me adaptando bem! Tenho sentido mais energia durante os treinos.',
        timestamp: now - (5 * oneHour),
        fromMe: false,
        type: 'text',
        phoneNumber: phoneNumber.replace(/\D/g, '')
      },
      {
        id: 'mock_4',
        text: 'Que ótimo! Continue assim. Lembre-se de se hidratar bem também.',
        timestamp: now - (4 * oneHour + 45 * 60000),
        fromMe: true,
        type: 'text',
        phoneNumber: phoneNumber.replace(/\D/g, '')
      },
      {
        id: 'mock_5',
        text: 'Doutora, posso comer uma fruta antes do treino da tarde?',
        timestamp: now - (2 * oneHour),
        fromMe: false,
        type: 'text',
        phoneNumber: phoneNumber.replace(/\D/g, '')
      },
      {
        id: 'mock_6',
        text: 'Sim! Uma banana ou maçã seria perfeita. Coma cerca de 30min antes do treino.',
        timestamp: now - (1 * oneHour + 30 * 60000),
        fromMe: true,
        type: 'text',
        phoneNumber: phoneNumber.replace(/\D/g, '')
      },
      {
        id: 'mock_7',
        text: 'Perfeito! Muito obrigado pelas orientações 😊',
        timestamp: now - (1 * oneHour),
        fromMe: false,
        type: 'text',
        phoneNumber: phoneNumber.replace(/\D/g, '')
      }
    ];
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
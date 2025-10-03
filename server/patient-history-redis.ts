import { createClient } from 'redis';

export interface ProcessedMessage {
  id: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
  type: 'text' | 'image' | 'audio' | 'unknown';
  phoneNumber: string;
}

export class PatientHistoryRedisService {
  private redis: any;
  private connected = false;

  constructor() {
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        connectTimeout: 5000,
        lazyConnect: true
      },
      password: process.env.REDIS_PASSWORD
    };

    console.log('[Patient History Redis] Connecting to:', redisConfig.socket.host + ':' + redisConfig.socket.port);
    this.redis = createClient(redisConfig);

    this.redis.on('error', (err: any) => {
      console.error('[Patient History Redis] Connection error:', err);
      this.connected = false;
    });

    this.redis.on('connect', () => {
      console.log('[Patient History Redis] Connected successfully');
      this.connected = true;
    });

    this.redis.on('ready', () => {
      console.log('[Patient History Redis] Redis ready for commands');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    
    try {
      const connectTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      );
      
      await Promise.race([this.redis.connect(), connectTimeout]);
      console.log('[Patient History Redis] Connection established');
      this.connected = true;
    } catch (error) {
      console.error('[Patient History Redis] Failed to connect:', error);
      console.log('[Patient History Redis] Will return empty array for queries');
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis && this.connected) {
      await this.redis.disconnect();
      this.connected = false;
    }
  }

  private parseMessages(messageStrings: string[], phoneNumber: string): ProcessedMessage[] {
    const messages: ProcessedMessage[] = [];
    let lastTimestamp = Date.now() - (messageStrings.length * 1000);
    
    for (let i = 0; i < messageStrings.length; i++) {
      const messageStr = messageStrings[i];
      
      try {
        if (messageStr.startsWith('Cliente: ')) {
          const text = messageStr.substring('Cliente: '.length).trim();
          lastTimestamp += 1000;
          
          messages.push({
            id: `client_${i}_${lastTimestamp}`,
            text,
            timestamp: lastTimestamp,
            fromMe: false,
            type: 'text',
            phoneNumber
          });
        }
        else if (messageStr.startsWith('Agente: ')) {
          const content = messageStr.substring('Agente: '.length);
          
          const timestampMatch = content.match(/^([^:]+)\s*:\s*(.+)$/);
          
          if (timestampMatch) {
            const timestampStr = timestampMatch[1].trim();
            const text = timestampMatch[2].trim();
            
            const timestamp = new Date(timestampStr).getTime();
            
            if (!isNaN(timestamp)) {
              lastTimestamp = timestamp;
            } else {
              lastTimestamp += 1000;
            }
            
            messages.push({
              id: `agent_${i}_${lastTimestamp}`,
              text,
              timestamp: lastTimestamp,
              fromMe: true,
              type: 'text',
              phoneNumber
            });
          }
        } else {
          console.warn('[Patient History Redis] Unknown message format:', messageStr);
        }
      } catch (error) {
        console.error('[Patient History Redis] Error parsing message:', error);
      }
    }
    
    return messages;
  }

  async getPatientMessages(
    nutritionistId: string, 
    phoneNumber: string, 
    limit?: number
  ): Promise<ProcessedMessage[]> {
    await this.connect();
    
    if (!this.connected) {
      console.log('[Patient History Redis] Not connected, returning empty array');
      return [];
    }
    
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const key = `${cleanPhone}@s.whatsapp.net_nutrciipppp`;
      
      console.log(`[Patient History Redis] Fetching messages for key: ${key}`);
      
      const value = await this.redis.get(key);
      
      if (!value) {
        console.log(`[Patient History Redis] No data found for key: ${key}`);
        return [];
      }
      
      const data = JSON.parse(value);
      
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`[Patient History Redis] Invalid data structure for key: ${key}`);
        return [];
      }
      
      const allMessages: ProcessedMessage[] = [];
      
      for (const item of data) {
        if (item.propertyName && Array.isArray(item.propertyName)) {
          const messages = this.parseMessages(item.propertyName, cleanPhone);
          allMessages.push(...messages);
        }
      }
      
      allMessages.sort((a, b) => a.timestamp - b.timestamp);
      
      const limitedMessages = limit ? allMessages.slice(0, limit) : allMessages;
      
      console.log(`[Patient History Redis] Processed ${limitedMessages.length} messages for patient ***${phoneNumber.slice(-4)}`);
      return limitedMessages;
    } catch (error) {
      console.error('[Patient History Redis] Error fetching patient messages:', error);
      return [];
    }
  }
}

export const patientHistoryRedis = new PatientHistoryRedisService();

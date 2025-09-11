import fetch from 'node-fetch';

export interface EvolutionInstanceResponse {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
  hash: {
    apikey: string;
  };
}

export interface EvolutionQRResponse {
  base64: string;
  code: string;
}

export interface EvolutionStatusResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  state: string;
}

export class EvolutionApiService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.EVOLUTION_API_URL || '';
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
    
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('EVOLUTION_API_URL and EVOLUTION_API_KEY environment variables are required');
    }
  }

  private async request(endpoint: string, options: any = {}): Promise<any> {
    // Properly construct URL - remove trailing slash from baseUrl and leading slash from endpoint
    const baseUrl = this.baseUrl.replace(/\/$/, '');
    const cleanEndpoint = endpoint.replace(/^\//, '');
    const url = `${baseUrl}/${cleanEndpoint}`;
    
    console.log(`[Evolution API] Making request to: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API Error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async createInstance(nutritionistId: string, whatsappNumber: string): Promise<EvolutionInstanceResponse> {
    const instanceName = `nutri_${nutritionistId}`;
    
    const payload = {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      number: whatsappNumber,
      rejectCall: true,
      msgCall: "Desculpe, não posso atender ligações no momento.",
      groupsIgnore: false,
      alwaysOnline: true,
      readMessages: true,
      readStatus: true,
      syncFullHistory: false
    };

    console.log(`[Evolution API] Creating instance for nutritionist ${nutritionistId}:`, payload);
    
    const response = await this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    console.log(`[Evolution API] Instance created successfully:`, response);
    return response;
  }

  async getQRCode(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`[Evolution API] Getting QR code for instance: ${instanceName}`);
    
    const response = await this.request(`/instance/connect/${instanceName}`);
    
    // Log the full response to understand the structure
    console.log(`[Evolution API] QR Code response:`, JSON.stringify(response, null, 2));
    
    return response;
  }

  async getInstanceStatus(instanceName: string): Promise<EvolutionStatusResponse> {
    console.log(`[Evolution API] Getting status for instance: ${instanceName}`);
    
    const response = await this.request(`/instance/connectionState/${instanceName}`);
    return response;
  }

  async deleteInstance(instanceName: string): Promise<void> {
    console.log(`[Evolution API] Deleting instance: ${instanceName}`);
    
    await this.request(`/instance/delete/${instanceName}`, {
      method: 'DELETE'
    });
  }

  // Utility function to clean WhatsApp number format
  static cleanWhatsAppNumber(whatsappNumber: string): string {
    // Remove all non-numeric characters
    const cleaned = whatsappNumber.replace(/\D/g, '');
    
    // Ensure it starts with country code (55 for Brazil)
    if (cleaned.length === 11 && !cleaned.startsWith('55')) {
      return '55' + cleaned;
    }
    
    return cleaned;
  }
}

// Create singleton instance
export const evolutionApi = new EvolutionApiService();
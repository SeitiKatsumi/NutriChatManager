const EVOLUTION_URL = "http://nutrichatbot-evolution-api.app.11mind.com.br";
const EVOLUTION_TOKEN = "nutrichatbot_secret_20250806";

class EvolutionApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Evolution API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async createInstance(instanceName: string) {
    return this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        token: this.token,
        qrcode: true,
        chatwoot_account_id: '',
        chatwoot_token: '',
        chatwoot_url: '',
        chatwoot_sign_msg: false,
        chatwoot_reopen_conversation: false,
        chatwoot_conversation_pending: false,
      }),
    });
  }

  async getInstanceQrCode(instanceName: string) {
    return this.request(`/instance/connect/${instanceName}`);
  }

  async getInstanceInfo(instanceName: string) {
    return this.request(`/instance/connectionState/${instanceName}`);
  }

  async deleteInstance(instanceName: string) {
    return this.request(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async sendMessage(instanceName: string, number: string, message: string) {
    return this.request(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        text: message,
      }),
    });
  }

  async getInstanceStatus(instanceName: string) {
    return this.request(`/instance/connectionState/${instanceName}`);
  }
}

export const evolutionApiClient = new EvolutionApiClient(EVOLUTION_URL, EVOLUTION_TOKEN);

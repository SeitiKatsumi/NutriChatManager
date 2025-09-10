const DIRECTUS_URL = "https://nutrichatbot.app.11mind.com.br";
const DIRECTUS_TOKEN = "j5SS6HS2lLHiTUYjmzuzDoAQqUvcfivI";

class DirectusClient {
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
      throw new Error(`Directus API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getUsers() {
    return this.request('/users');
  }

  async createUser(userData: any) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(userId: string, userData: any) {
    return this.request(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(userId: string) {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async getCollectionItems(collection: string) {
    return this.request(`/items/${collection}`);
  }

  async createCollectionItem(collection: string, data: any) {
    return this.request(`/items/${collection}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const directusClient = new DirectusClient(DIRECTUS_URL, DIRECTUS_TOKEN);

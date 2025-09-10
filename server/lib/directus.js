import fetch from "node-fetch";

const DIRECTUS_URL = "https://nutrichatbot.app.11mind.com.br";
const DIRECTUS_TOKEN = "j5SS6HS2lLHiTUYjmzuzDoAQqUvcfivI";

class DirectusClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(endpoint, options = {}) {
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

  async createUser(userData) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(userId, userData) {
    return this.request(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(userId) {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async getCollectionItems(collection) {
    return this.request(`/items/${collection}`);
  }

  async createCollectionItem(collection, data) {
    return this.request(`/items/${collection}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

const directusClient = new DirectusClient(DIRECTUS_URL, DIRECTUS_TOKEN);

export { directusClient };
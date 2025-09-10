import fetch from "node-fetch";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "https://nutrichatbot.app.11mind.com.br";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
  console.error('CRITICAL: DIRECTUS_TOKEN environment variable is required but not set');
  console.error('Please set DIRECTUS_TOKEN in your environment variables');
}

class DirectusClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`[Directus] ${options.method || 'GET'} ${url}`);
    if (options.body) {
      console.log(`[Directus] Request body:`, JSON.parse(options.body));
    }
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });

    console.log(`[Directus] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Directus] Error response text:`, errorText);
      throw new Error(`Directus API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Read response text first to handle empty responses gracefully
    const responseText = await response.text();
    const contentType = response.headers.get('content-type');
    
    console.log(`[Directus] Content-Type: ${contentType}`);
    console.log(`[Directus] Response text:`, responseText);
    
    // If response is empty, return empty object
    if (!responseText.trim()) {
      console.log(`[Directus] Empty response, returning empty object`);
      return { data: null };
    }
    
    // Try to parse as JSON if content-type suggests JSON or if it looks like JSON
    if ((contentType && contentType.includes('application/json')) || responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
      try {
        const jsonData = JSON.parse(responseText);
        console.log(`[Directus] Parsed JSON:`, jsonData);
        return jsonData;
      } catch (error) {
        console.error(`[Directus] JSON parse error:`, error.message);
        console.error(`[Directus] Response text was:`, responseText);
        throw new Error(`Failed to parse Directus response as JSON: ${error.message}`);
      }
    }
    
    // Non-JSON response
    console.log(`[Directus] Non-JSON response:`, responseText);
    return { data: responseText };
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

  // Authentication methods
  async login(email, password) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async logout(refreshToken) {
    return this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });
  }

  async refreshToken(refreshToken) {
    const response = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getMe(accessToken) {
    const response = await fetch(`${this.baseUrl}/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Get user failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

const directusClient = new DirectusClient(DIRECTUS_URL, DIRECTUS_TOKEN);

export { DirectusClient, directusClient };
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

// Health check for admin token permissions
async function checkDirectusAdminPermissions() {
  try {
    console.log('[Directus] Checking admin token permissions...');
    const response = await directusClient.request('/users/me');
    const user = response.data;
    
    console.log('[Directus] Token user info:', {
      id: user.id,
      email: user.email,
      role: user.role,
      admin_access: user.admin_access,
      status: user.status
    });
    
    if (!user.admin_access) {
      console.error('[Directus] WARNING: Token does not have admin access! This will cause permission errors.');
      console.error('[Directus] Current role:', user.role);
      console.error('[Directus] Please ensure DIRECTUS_TOKEN belongs to an Admin user.');
    } else {
      console.log('[Directus] ✓ Admin token verified successfully');
    }
    
    return user.admin_access;
  } catch (error) {
    console.error('[Directus] Failed to check admin permissions:', error.message);
    console.error('[Directus] This suggests the token is invalid or expired');
    return false;
  }
}

// Global flag for Directus capabilities
let PATIENTS_MODE = 'checking'; // 'directus' | 'local' | 'checking'

// Probe Directus capability for patient collection access
async function probeDirectusPatientsAccess() {
  try {
    console.log('[Directus] Probing patient collection access...');
    // Test if we can read from the patients collection
    const response = await directusClient.request('/items/Cadastro_de_Pacientes?limit=1');
    console.log('[Directus] ✓ Patient collection access confirmed - using Directus mode');
    PATIENTS_MODE = 'directus';
    return true;
  } catch (error) {
    console.log('[Directus] ✗ Patient collection access failed:', error.message);
    console.log('[Directus] Falling back to local memory storage for patients');
    console.log('[Directus] To use Directus storage: ensure DIRECTUS_TOKEN has admin access or proper collection permissions');
    PATIENTS_MODE = 'local';
    return false;
  }
}

// Run health checks on startup
checkDirectusAdminPermissions();
probeDirectusPatientsAccess();

// Getter function for patients mode (since let variables can't be exported directly)
function getPatientsMode() {
  return PATIENTS_MODE;
}

export { DirectusClient, directusClient, getPatientsMode };
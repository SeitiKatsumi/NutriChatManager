import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { insertNutritionistSchema, insertWhatsappInstanceSchema, insertPatientSchema } from "@shared/schema";
import { z } from "zod";
// Import real API clients (server-side versions)
// @ts-ignore - directus.js doesn't have type declarations
import { directusClient } from "./lib/directus.js";
// Evolution API service will be imported dynamically where needed
import { evolutionApi } from "./evolution-api";
import { evolutionRedis } from "./evolution-redis";
import { openaiService } from "./openai-service";

// Extend session type to include user
declare module 'express-session' {
  export interface SessionData {
    user?: any;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Middleware to check authentication
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.session.user || !req.session.user.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // Nutritionists routes
  app.get("/api/nutritionists", requireAuth, async (req, res) => {
    try {
      // Security: Users can only see their own data - return only logged-in user
      const userToken = req.session.user.accessToken;
      const currentUser = await storage.getNutritionist(req.session.user.id, userToken);
      
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Return as array to maintain compatibility with frontend
      res.json([currentUser]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch nutritionists" });
    }
  });

  app.get("/api/nutritionists/:id", requireAuth, async (req, res) => {
    try {
      // Security: Users can only access their own data
      if (req.params.id !== req.session.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.getNutritionist(req.params.id, userToken);
      if (!nutritionist) {
        return res.status(404).json({ error: "Nutritionist not found" });
      }
      res.json(nutritionist);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch nutritionist" });
    }
  });

  app.post("/api/nutritionists", async (req, res) => {
    try {
      const validatedData = insertNutritionistSchema.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getNutritionistByEmail(validatedData.email);
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Create nutritionist using DirectusStorage (which handles Directus user creation)
      const nutritionist = await storage.createNutritionist(validatedData);

      res.status(201).json(nutritionist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create nutritionist" });
    }
  });

  app.put("/api/nutritionists/:id", requireAuth, async (req, res) => {
    try {
      // Security: Users can only update their own data
      if (req.params.id !== req.session.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const validatedData = insertNutritionistSchema.partial().parse(req.body);
      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.updateNutritionist(req.params.id, validatedData, userToken);
      
      if (!nutritionist) {
        return res.status(404).json({ error: "Nutritionist not found" });
      }
      
      res.json(nutritionist);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update nutritionist" });
    }
  });

  app.delete("/api/nutritionists/:id", requireAuth, async (req, res) => {
    try {
      // Security: Users can only delete their own account
      if (req.params.id !== req.session.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const userToken = req.session.user.accessToken;
      const deleted = await storage.deleteNutritionist(req.params.id, userToken);
      if (!deleted) {
        return res.status(404).json({ error: "Nutritionist not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete nutritionist" });
    }
  });

  // WhatsApp instances routes (PROTECTED)
  app.get("/api/whatsapp-instances", requireAuth, async (req, res) => {
    try {
      // Security: Users can only see their own instance
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      
      // Get nutritionist data to check for Evolution instance
      const nutritionist = await storage.getNutritionist(nutritionistId, userToken);
      if (!nutritionist || !nutritionist.evolutionInstanceName) {
        return res.json([]); // Return empty if no instance configured
      }
      
      // Return formatted instance data for backward compatibility
      const instance = {
        id: nutritionist.evolutionInstanceName,
        instanceName: nutritionist.evolutionInstanceName,
        phoneNumber: nutritionist.whatsappIA,
        status: "connected", // This would need real status check
        nutritionistId: nutritionistId
      };
      
      res.json([instance]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp instances" });
    }
  });

  app.get("/api/whatsapp-instances/nutritionist/:nutritionistId", requireAuth, async (req, res) => {
    try {
      // Security: Users can only access their own instance
      if (req.params.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const instance = await storage.getWhatsappInstanceByNutritionist(req.params.nutritionistId);
      if (!instance) {
        return res.status(404).json({ error: "WhatsApp instance not found" });
      }
      res.json(instance);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp instance" });
    }
  });

  app.post("/api/whatsapp-instances", requireAuth, async (req, res) => {
    try {
      // Security: Add nutritionistId from session
      const instanceData = {
        ...req.body,
        nutritionistId: req.session.user.nutritionistId
      };
      
      const validatedData = insertWhatsappInstanceSchema.parse(instanceData);
      const instance = await storage.createWhatsappInstance(validatedData);
      res.status(201).json(instance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create WhatsApp instance" });
    }
  });

  app.put("/api/whatsapp-instances/:id", requireAuth, async (req, res) => {
    try {
      // Security: Verify ownership before update
      const existingInstance = await storage.getWhatsappInstance(req.params.id);
      if (!existingInstance || existingInstance.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const validatedData = insertWhatsappInstanceSchema.partial().parse(req.body);
      const instance = await storage.updateWhatsappInstance(req.params.id, validatedData);
      
      if (!instance) {
        return res.status(404).json({ error: "WhatsApp instance not found" });
      }
      
      res.json(instance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update WhatsApp instance" });
    }
  });

  // Patients routes (protected)
  app.get("/api/patients", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      const patients = await storage.getPatientsByNutritionist(nutritionistId, userToken);
      
      // Optional filtering by status, name, etc.
      const { status, search } = req.query;
      let filteredPatients = patients;
      
      if (status && typeof status === 'string') {
        filteredPatients = filteredPatients.filter((p: any) => p.status === status);
      }
      
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        filteredPatients = filteredPatients.filter((p: any) => 
          p.fullName.toLowerCase().includes(searchLower) ||
          (p.email && p.email.toLowerCase().includes(searchLower)) ||
          (p.phone && p.phone.includes(search))
        );
      }
      
      res.json(filteredPatients);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch patients" });
    }
  });

  app.get("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(req.params.id, userToken);
      
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      // Verify ownership - patient must belong to logged nutritionist
      if (patient.nutritionistId !== nutritionistId) {
        return res.status(403).json({ error: "Access denied. You can only view your own patients." });
      }
      
      res.json(patient);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch patient" });
    }
  });

  app.post("/api/patients", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      
      // First add nutritionistId to the data, then validate
      const patientDataWithNutritionist = {
        ...req.body,
        nutritionistId
      };
      
      const validatedData = insertPatientSchema.parse(patientDataWithNutritionist);
      
      const patient = await storage.createPatient(validatedData, userToken);
      res.status(201).json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create patient" });
    }
  });

  app.put("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      const patientId = req.params.id;
      
      // First verify patient exists and belongs to nutritionist
      const existingPatient = await storage.getPatient(patientId, userToken);
      if (!existingPatient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      if (existingPatient.nutritionistId !== nutritionistId) {
        return res.status(403).json({ error: "Access denied. You can only update your own patients." });
      }
      
      const validatedData = insertPatientSchema.partial().parse(req.body);
      
      // Prevent changing nutritionistId
      const { nutritionistId: _, ...updateData } = validatedData;
      
      const patient = await storage.updatePatient(patientId, updateData, userToken);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      res.json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update patient" });
    }
  });

  app.delete("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      const patientId = req.params.id;
      
      // First verify patient exists and belongs to nutritionist
      const existingPatient = await storage.getPatient(patientId, userToken);
      if (!existingPatient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      if (existingPatient.nutritionistId !== nutritionistId) {
        return res.status(403).json({ error: "Access denied. You can only delete your own patients." });
      }
      
      const deleted = await storage.deletePatient(patientId, userToken);
      if (!deleted) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete patient" });
    }
  });

  // Evolution API WhatsApp routes
  app.get("/api/whatsapp/qrcode/:nutritionistId", requireAuth, async (req, res) => {
    try {
      // Security: Users can only get QR code for their own instance  
      if (req.params.nutritionistId !== req.session.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.getNutritionist(req.params.nutritionistId, userToken);
      
      if (!nutritionist || !nutritionist.evolutionInstanceName) {
        return res.status(404).json({ error: "WhatsApp instance not found" });
      }

      const { evolutionApi } = await import('./evolution-api.ts');
      const qrResponse = await evolutionApi.getQRCode(nutritionist.evolutionInstanceName);
      
      // Extract only the base64 field that the frontend expects
      res.json({ 
        base64: qrResponse.base64
      });
    } catch (error: any) {
      console.error("Error getting QR code:", error);
      res.status(500).json({ error: error.message || "Failed to generate QR code" });
    }
  });

  app.get("/api/whatsapp/status/:nutritionistId", requireAuth, async (req, res) => {
    try {
      // Security: Users can only check status of their own instance
      if (req.params.nutritionistId !== req.session.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.getNutritionist(req.params.nutritionistId, userToken);
      
      if (!nutritionist || !nutritionist.evolutionInstanceName) {
        return res.status(404).json({ error: "WhatsApp instance not found" });
      }

      const { evolutionApi } = await import('./evolution-api.ts');
      const statusResponse = await evolutionApi.getInstanceStatus(nutritionist.evolutionInstanceName);
      
      // Force fresh response with unique identifiers
      const timestamp = Date.now();
      const uniqueETag = `"${timestamp}-${Math.random()}"`;
      
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
        'ETag': uniqueETag,
        'Last-Modified': new Date().toUTCString(),
        'Vary': '*'
      });
      
      // Add timestamp to response to ensure uniqueness
      res.json({
        ...statusResponse,
        _timestamp: timestamp,
        _cache_buster: Math.random()
      });
    } catch (error: any) {
      console.error("Error getting WhatsApp status:", error);
      res.status(500).json({ error: error.message || "Failed to get status" });
    }
  });

  // Statistics endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const nutritionists = await storage.listNutritionists();
      const instances = await storage.listWhatsappInstances();
      const messagesCount = await storage.getMessagesCount();
      
      const connectedInstances = instances.filter((i: any) => i.status === "connected").length;
      
      res.json({
        nutritionists: nutritionists.length,
        connectedWhatsapp: connectedInstances,
        messages: messagesCount,
        responseRate: "97.2%" // This would be calculated from actual data
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // Nutritionist individual dashboard stats (protected)
  app.get("/api/nutritionists/:id/dashboard", requireAuth, async (req, res) => {
    try {
      const requestedId = req.params.id;
      const loggedInNutritionistId = req.session.user.nutritionistId;
      
      // Users can only access their own dashboard
      if (requestedId !== loggedInNutritionistId) {
        return res.status(403).json({ error: "Access denied. You can only view your own dashboard." });
      }

      const nutritionist = await storage.getNutritionist(requestedId);
      if (!nutritionist) {
        return res.status(404).json({ error: "Nutritionist not found" });
      }

      const userToken = req.session.user.accessToken;
      const patients = await storage.getPatientsByNutritionist(nutritionist.id, userToken);
      const whatsappInstance = await storage.getWhatsappInstanceByNutritionist(nutritionist.id, userToken);
      const messages = whatsappInstance ? await storage.getMessagesByInstance(whatsappInstance.id) : [];
      
      const stats = {
        totalPatients: patients.length,
        activePatients: patients.filter((p: any) => p.status === 'active').length,
        totalConsultations: patients.reduce((total: any, patient: any) => total + (patient.consultationCount || 0), 0),
        totalMessages: messages.length,
        whatsappConnected: whatsappInstance?.status === 'connected',
        responseRate: "95%"
      };
      
      res.json({
        nutritionist,
        stats,
        recentPatients: patients.slice(-5).reverse(),
        recentMessages: messages.slice(-10).reverse()
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch nutritionist dashboard" });
    }
  });

  // Convenience endpoint to get current user's dashboard
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const nutritionist = await storage.getNutritionist(nutritionistId);
      
      if (!nutritionist) {
        return res.status(404).json({ error: "Nutritionist profile not found" });
      }

      const userToken = req.session.user.accessToken;
      const patients = await storage.getPatientsByNutritionist(nutritionist.id, userToken);
      const whatsappInstance = await storage.getWhatsappInstanceByNutritionist(nutritionist.id, userToken);
      const messages = whatsappInstance ? await storage.getMessagesByInstance(whatsappInstance.id) : [];
      
      const stats = {
        totalPatients: patients.length,
        activePatients: patients.filter((p: any) => p.status === 'active').length,
        totalConsultations: patients.reduce((total: any, patient: any) => total + (patient.consultationCount || 0), 0),
        totalMessages: messages.length,
        whatsappConnected: whatsappInstance?.status === 'connected',
        responseRate: "95%"
      };
      
      res.json({
        nutritionist,
        stats,
        recentPatients: patients.slice(-5).reverse(),
        recentMessages: messages.slice(-10).reverse()
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });

  // Authentication endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log(`Login attempt for email: ${email}`);
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Use Directus authentication
      const loginResponse = await directusClient.login(email, password);
      
      // Get user details from Directus
      const directusUser = await directusClient.getMe(loginResponse.data.access_token);
      
      // Check if user has nutritionist role
      if (directusUser.data.role !== '90ce89ef-abe3-4359-9fc0-3e882127775a') {
        return res.status(403).json({ error: "Access denied. Nutritionist role required" });
      }

      // Create local session with Directus tokens
      req.session.user = {
        id: directusUser.data.id,
        email: directusUser.data.email,
        nutritionistId: directusUser.data.id,
        role: directusUser.data.role,
        accessToken: loginResponse.data.access_token,
        refreshToken: loginResponse.data.refresh_token,
      };

      console.log(`=== Login successful ===`);
      console.log(`Session ID: ${req.sessionID}`);
      console.log(`Nutritionist ID: ${directusUser.data.id}`);
      console.log(`Session user created:`, req.session.user);
      
      // Transform Directus user to our nutritionist format
      const nutritionist = {
        id: directusUser.data.id,
        fullName: directusUser.data.full_name || `${directusUser.data.first_name} ${directusUser.data.last_name}`.trim(),
        email: directusUser.data.email,
        crn: directusUser.data.crn || '',
        phone: directusUser.data.phone || '',
        address: directusUser.data.address || '',
        specialization: directusUser.data.specialization || '',
        whatsappNumber: directusUser.data.whatsapp_number || '',
        welcomeMessage: directusUser.data.welcome_message || '',
        workingHours: directusUser.data.working_hours || 'commercial',
        status: directusUser.data.status || 'active',
        createdAt: directusUser.data.date_created,
        updatedAt: directusUser.data.date_updated,
      };
      
      res.json({
        user: {
          id: nutritionist.id,
          email: nutritionist.email,
          name: nutritionist.fullName,
          nutritionistId: nutritionist.id,
        },
        nutritionist,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.message && error.message.includes('Login failed')) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      res.status(500).json({ error: "Authentication service error" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      if (req.session.user?.refreshToken) {
        await directusClient.logout(req.session.user.refreshToken);
      }
      req.session.destroy(() => {
        res.json({ message: "Logged out successfully" });
      });
    } catch (error) {
      console.error('Logout error:', error);
      req.session.destroy(() => {
        res.json({ message: "Logged out successfully" });
      });
    }
  });

  // Admin login route - for Directus administrators
  app.post("/api/auth/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log(`Admin login attempt for email: ${email}`);
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      console.log(`Attempting Directus authentication for: ${email}`);
      // Use Directus authentication
      const loginResponse = await directusClient.login(email, password);
      console.log(`Directus login successful for: ${email}`);
      
      // Get user details from Directus
      const directusUser = await directusClient.getMe(loginResponse.data.access_token);
      
      // Debug: Log user details to understand admin access
      console.log(`User details for ${email}:`, {
        id: directusUser.data.id,
        email: directusUser.data.email,
        role: directusUser.data.role,
        admin_access: directusUser.data.admin_access,
        status: directusUser.data.status
      });
      
      // Check if user has admin access - be more flexible
      // Known admin emails (as confirmed by user)
      const adminEmails = ['seitikatsumi@gmail.com'];
      
      // Check admin_access flag, specific admin role IDs, or known admin emails
      const adminRoleIds = ['70df1b96-2eec-455e-809e-5517390892fb']; // Known admin role ID from system
      const isAdmin = directusUser.data.admin_access === true || 
                     adminRoleIds.includes(directusUser.data.role) ||
                     adminEmails.includes(directusUser.data.email);
      
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied. Administrator role required" });
      }

      // Create local session with admin flag
      req.session.user = {
        id: directusUser.data.id,
        email: directusUser.data.email,
        nutritionistId: null,
        role: directusUser.data.role,
        accessToken: loginResponse.data.access_token,
        refreshToken: loginResponse.data.refresh_token,
        isAdmin: true
      };

      console.log(`=== Admin login successful ===`);
      console.log(`Session ID: ${req.sessionID}`);
      console.log(`Admin ID: ${directusUser.data.id}`);
      
      res.json({
        user: {
          id: directusUser.data.id,
          email: directusUser.data.email,
          name: `${directusUser.data.first_name || ''} ${directusUser.data.last_name || ''}`.trim() || directusUser.data.email,
          isAdmin: true,
        },
      });
    } catch (error: any) {
      console.error('Admin login error:', error);
      console.log(`Error message: ${error.message}`);
      console.log(`Error status: ${error.response?.status}`);
      console.log(`Error response:`, error.response?.data);
      
      if (error.message && error.message.includes('Login failed')) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      if (error.response?.status === 401) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      res.status(500).json({ error: "Authentication service error" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      console.log('=== /api/auth/me called ===');
      console.log('Session ID:', req.sessionID);
      console.log('Session exists:', !!req.session);
      console.log('Session user:', req.session?.user);
      
      if (!req.session.user) {
        console.log('No session user found - returning 401');
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get nutritionist from local database
      const nutritionist = await storage.getNutritionist(req.session.user.nutritionistId);
      if (!nutritionist) {
        console.log('Nutritionist not found for session user:', req.session.user.nutritionistId);
        req.session.destroy(() => {
          return res.status(401).json({ error: "Session expired" });
        });
        return;
      }

      console.log('Session user verified, returning user data');
      res.json({
        user: {
          id: req.session.user.id,
          email: req.session.user.email,
          name: nutritionist.fullName,
          nutritionistId: nutritionist.id,
        },
        nutritionist,
      });
    } catch (error) {
      console.error('Get user error:', error);
      // If there's any error, clear session
      req.session.destroy(() => {
        res.status(401).json({ error: "Session expired" });
      });
    }
  });

  // Evolution API proxy endpoints
  app.post("/api/evolution/generate-qr/:instanceId", async (req, res) => {
    try {
      const { instanceId } = req.params;
      
      // Create instance first if it doesn't exist
      try {
        await evolutionApi.createInstance('', instanceId);
      } catch (createError) {
        // Instance might already exist, continue
        console.log('Instance might already exist:', instanceId);
      }
      
      // Get QR code from Evolution API
      const qrResponse = await evolutionApi.getQRCode(instanceId);
      
      res.json({
        qrCode: qrResponse.base64 || qrResponse.code,
        instanceId,
        status: "waiting_for_connection"
      });
    } catch (error) {
      const { instanceId } = req.params;
      console.error('Evolution API QR generation error:', error);
      // Fallback to mock for development
      const qrCode = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAACXBIWXMAAAsTAAALEwEAmpwYAAABM0lEQVR4nO3BMQEAAADCoPVPbQdvoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+DEfEKYAAAH5BJQAAAAASUVORK5CYII=`;
      
      res.json({
        qrCode,
        instanceId,
        status: "waiting_for_connection"
      });
    }
  });

  app.get("/api/evolution/status/:instanceId", async (req, res) => {
    try {
      const { instanceId } = req.params;
      
      // Get status from Evolution API
      const statusResponse = await evolutionApi.getInstanceStatus(instanceId);
      
      res.json({
        instanceId,
        status: statusResponse.state || "disconnected",
        phoneNumber: statusResponse.instance?.instanceName || null
      });
    } catch (error) {
      const { instanceId } = req.params;
      console.error('Evolution API status check error:', error);
      // Fallback to mock for development
      res.json({
        instanceId,
        status: "disconnected",
        phoneNumber: null
      });
    }
  });

  // AI Consultation endpoints
  const askRequestSchema = z.object({
    patientId: z.number(),
    question: z.string().min(5, "Pergunta deve ter pelo menos 5 caracteres"),
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional()
    }).optional()
  });

  app.post("/api/ai/ask", requireAuth, async (req, res) => {
    try {
      const { patientId, question, dateRange } = askRequestSchema.parse(req.body);
      
      // Security: Verify patient belongs to this nutritionist
      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(patientId.toString(), userToken);
      
      if (!patient || patient.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - patient not found or not your patient" });
      }
      
      // Get messages from Evolution Redis
      const phoneNumber = patient.phone;
      const nutritionistId = req.session.user.nutritionistId;
      
      console.log(`[AI Ask] Getting messages for patient ${patient.fullName} (${phoneNumber})`);
      
      const messages = await evolutionRedis.getPatientMessages(nutritionistId, phoneNumber, 500);
      
      if (messages.length === 0) {
        return res.json({
          answer: "Não encontrei mensagens para este paciente no histórico de conversas.",
          sources: [],
          confidence: 0.1
        });
      }
      
      // Filter by date range if provided
      let filteredMessages = messages;
      if (dateRange?.start || dateRange?.end) {
        const startTime = dateRange.start ? new Date(dateRange.start).getTime() : 0;
        const endTime = dateRange.end ? new Date(dateRange.end).getTime() : Date.now();
        
        filteredMessages = messages.filter(msg => 
          msg.timestamp >= startTime && msg.timestamp <= endTime
        );
      }
      
      console.log(`[AI Ask] Processing ${filteredMessages.length} messages for question: ${question}`);
      
      // Process with OpenAI
      const response = await openaiService.askAboutPatient(
        filteredMessages, 
        question, 
        patient.fullName
      );
      
      res.json(response);
      
    } catch (error) {
      console.error('[AI Ask] Error processing request:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request format",
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Erro interno do servidor",
        message: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  app.get("/api/ai/insights/:patientId", requireAuth, async (req, res) => {
    try {
      const patientId = req.params.patientId;
      
      // Security: Verify patient belongs to this nutritionist
      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(patientId, userToken);
      
      if (!patient || patient.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - patient not found or not your patient" });
      }
      
      // Get messages from Evolution Redis
      const phoneNumber = patient.whatsapp || patient.phone;
      const nutritionistId = req.session.user.nutritionistId;
      
      const messages = await evolutionRedis.getPatientMessages(nutritionistId, phoneNumber, 200);
      
      if (messages.length === 0) {
        return res.json({
          summary: "Sem mensagens disponíveis",
          keyTopics: [],
          patientMood: "neutral",
          recommendations: []
        });
      }
      
      // Generate insights with OpenAI
      const insights = await openaiService.generateQuickInsights(messages);
      
      res.json(insights);
      
    } catch (error) {
      console.error('[AI Insights] Error generating insights:', error);
      res.status(500).json({ 
        error: "Erro ao gerar insights",
        message: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Test endpoint to check Evolution Redis connection
  app.get("/api/ai/test-connection/:nutritionistId", requireAuth, async (req, res) => {
    try {
      const { nutritionistId } = req.params;
      
      // Security: Users can only test their own connection
      if (nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const patients = await evolutionRedis.getNutritionistPatients(nutritionistId);
      
      res.json({
        connected: true,
        patientsFound: patients.length,
        patients: patients.slice(0, 5) // Show first 5 for testing
      });
      
    } catch (error) {
      console.error('[AI Test] Redis connection error:', error);
      res.status(500).json({ 
        connected: false,
        error: error instanceof Error ? error.message : "Connection failed"
      });
    }
  });

  // Admin routes - protected by requireAdmin middleware
  app.get("/api/admin/nutritionists", requireAdmin, async (req, res) => {
    try {
      console.log('[Admin] Getting all nutritionists');
      
      // Use Directus to get all users with nutritionist role
      const userToken = req.session.user.accessToken;
      const response = await fetch(`${process.env.DIRECTUS_URL}/users?filter[role][_eq]=90ce89ef-abe3-4359-9fc0-3e882127775a&fields=*`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Directus API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform Directus users to nutritionist format
      const nutritionists = data.data.map((user: any) => ({
        id: user.id,
        fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        email: user.email,
        crn: user.crn || '',
        phone: user.phone || '',
        address: user.address || '',
        specialization: user.specialization || '',
        whatsappNumber: user.whatsapp_number || '',
        welcomeMessage: user.welcome_message || '',
        workingHours: user.working_hours || 'commercial',
        status: user.status || 'active',
        createdAt: user.date_created,
        updatedAt: user.date_updated,
        lastAccess: user.last_access,
        evolutionInstance: user.Instancia_Evolution,
        whatsappIA: user.Whatsapp_IA
      }));

      console.log(`[Admin] Found ${nutritionists.length} nutritionists`);
      res.json(nutritionists);
    } catch (error) {
      console.error('[Admin] Error getting nutritionists:', error);
      res.status(500).json({ error: "Failed to fetch nutritionists" });
    }
  });

  app.get("/api/admin/nutritionists/:id", requireAdmin, async (req, res) => {
    try {
      const nutritionistId = req.params.id;
      console.log(`[Admin] Getting nutritionist details for ID: ${nutritionistId}`);
      
      const userToken = req.session.user.accessToken;
      const response = await fetch(`${process.env.DIRECTUS_URL}/users/${nutritionistId}?fields=*`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Nutritionist not found" });
        }
        throw new Error(`Directus API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const user = data.data;
      
      // Transform Directus user to nutritionist format
      const nutritionist = {
        id: user.id,
        fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        email: user.email,
        crn: user.crn || '',
        phone: user.phone || '',
        address: user.address || '',
        specialization: user.specialization || '',
        whatsappNumber: user.whatsapp_number || '',
        welcomeMessage: user.welcome_message || '',
        workingHours: user.working_hours || 'commercial',
        status: user.status || 'active',
        createdAt: user.date_created,
        updatedAt: user.date_updated,
        lastAccess: user.last_access,
        evolutionInstance: user.Instancia_Evolution,
        whatsappIA: user.Whatsapp_IA
      };

      res.json(nutritionist);
    } catch (error) {
      console.error('[Admin] Error getting nutritionist:', error);
      res.status(500).json({ error: "Failed to fetch nutritionist" });
    }
  });

  app.get("/api/admin/patients", requireAdmin, async (req, res) => {
    try {
      console.log('[Admin] Getting all patients');
      
      const userToken = req.session.user.accessToken;
      
      // Get all patients directly from Directus
      const response = await fetch(`${process.env.DIRECTUS_URL}/items/Cadastro_de_Pacientes?fields=id,Nutricionista_responsavel,Nome_Completo,Whatsapp,Data_de_nascimento,Sexo,Peso,Altura,Anamise_inicial,Suplementos_e_medicamentos,Etapas,date_created,date_updated`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Directus API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform patients to match our format
      const patients = data.data.map((patient: any) => ({
        id: patient.id,
        nutritionistId: patient.Nutricionista_responsavel,
        fullName: patient.Nome_Completo || '',
        whatsapp: patient.Whatsapp || '',
        phone: patient.Whatsapp || '', // Using whatsapp as primary phone
        birthDate: patient.Data_de_nascimento,
        gender: patient.Sexo,
        weight: patient.Peso,
        height: patient.Altura,
        initialAnalysis: patient.Anamise_inicial,
        supplements: patient.Suplementos_e_medicamentos,
        status: patient.Etapas || 'active',
        createdAt: patient.date_created,
        updatedAt: patient.date_updated
      }));
      
      console.log(`[Admin] Found ${patients.length} patients`);
      res.json(patients);
    } catch (error) {
      console.error('[Admin] Error getting patients:', error);
      res.status(500).json({ error: "Failed to fetch patients" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

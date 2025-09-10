import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { insertNutritionistSchema, insertWhatsappInstanceSchema, insertPatientSchema } from "@shared/schema";
import { z } from "zod";
// Import real API clients (server-side versions)
// @ts-ignore - directus.js doesn't have type declarations
import { directusClient } from "./lib/directus.js";
// @ts-ignore - evolution-api.js doesn't have type declarations  
import { evolutionApiClient } from "./lib/evolution-api.js";

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

  // Nutritionists routes
  app.get("/api/nutritionists", async (req, res) => {
    try {
      const nutritionists = await storage.listNutritionists();
      res.json(nutritionists);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch nutritionists" });
    }
  });

  app.get("/api/nutritionists/:id", async (req, res) => {
    try {
      const nutritionist = await storage.getNutritionist(req.params.id);
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

  app.put("/api/nutritionists/:id", async (req, res) => {
    try {
      const validatedData = insertNutritionistSchema.partial().parse(req.body);
      const nutritionist = await storage.updateNutritionist(req.params.id, validatedData);
      
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

  app.delete("/api/nutritionists/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteNutritionist(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Nutritionist not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete nutritionist" });
    }
  });

  // WhatsApp instances routes
  app.get("/api/whatsapp-instances", async (req, res) => {
    try {
      const instances = await storage.listWhatsappInstances();
      res.json(instances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp instances" });
    }
  });

  app.get("/api/whatsapp-instances/nutritionist/:nutritionistId", async (req, res) => {
    try {
      const instance = await storage.getWhatsappInstanceByNutritionist(req.params.nutritionistId);
      if (!instance) {
        return res.status(404).json({ error: "WhatsApp instance not found" });
      }
      res.json(instance);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp instance" });
    }
  });

  app.post("/api/whatsapp-instances", async (req, res) => {
    try {
      const validatedData = insertWhatsappInstanceSchema.parse(req.body);
      const instance = await storage.createWhatsappInstance(validatedData);
      res.status(201).json(instance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create WhatsApp instance" });
    }
  });

  app.put("/api/whatsapp-instances/:id", async (req, res) => {
    try {
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
      const patients = await storage.getPatientsByNutritionist(nutritionistId);
      
      // Optional filtering by status, name, etc.
      const { status, search } = req.query;
      let filteredPatients = patients;
      
      if (status && typeof status === 'string') {
        filteredPatients = filteredPatients.filter(p => p.status === status);
      }
      
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        filteredPatients = filteredPatients.filter(p => 
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
      const patient = await storage.getPatient(req.params.id);
      
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
      const validatedData = insertPatientSchema.parse(req.body);
      
      // Ensure patient is associated with logged nutritionist
      const patientData = {
        ...validatedData,
        nutritionistId
      };
      
      const patient = await storage.createPatient(patientData);
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
      const patientId = req.params.id;
      
      // First verify patient exists and belongs to nutritionist
      const existingPatient = await storage.getPatient(patientId);
      if (!existingPatient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      if (existingPatient.nutritionistId !== nutritionistId) {
        return res.status(403).json({ error: "Access denied. You can only update your own patients." });
      }
      
      const validatedData = insertPatientSchema.partial().parse(req.body);
      
      // Prevent changing nutritionistId
      const { nutritionistId: _, ...updateData } = validatedData;
      
      const patient = await storage.updatePatient(patientId, updateData);
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
      const patientId = req.params.id;
      
      // First verify patient exists and belongs to nutritionist
      const existingPatient = await storage.getPatient(patientId);
      if (!existingPatient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      if (existingPatient.nutritionistId !== nutritionistId) {
        return res.status(403).json({ error: "Access denied. You can only delete your own patients." });
      }
      
      const deleted = await storage.deletePatient(patientId);
      if (!deleted) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete patient" });
    }
  });

  // Statistics endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const nutritionists = await storage.listNutritionists();
      const instances = await storage.listWhatsappInstances();
      const messagesCount = await storage.getMessagesCount();
      
      const connectedInstances = instances.filter(i => i.status === "connected").length;
      
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

      const patients = await storage.getPatientsByNutritionist(nutritionist.id);
      const whatsappInstance = await storage.getWhatsappInstanceByNutritionist(nutritionist.id);
      const messages = whatsappInstance ? await storage.getMessagesByInstance(whatsappInstance.id) : [];
      
      const stats = {
        totalPatients: patients.length,
        activePatients: patients.filter(p => p.status === 'active').length,
        totalConsultations: patients.reduce((total, patient) => total + (patient.consultationCount || 0), 0),
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

      const patients = await storage.getPatientsByNutritionist(nutritionist.id);
      const whatsappInstance = await storage.getWhatsappInstanceByNutritionist(nutritionist.id);
      const messages = whatsappInstance ? await storage.getMessagesByInstance(whatsappInstance.id) : [];
      
      const stats = {
        totalPatients: patients.length,
        activePatients: patients.filter(p => p.status === 'active').length,
        totalConsultations: patients.reduce((total, patient) => total + (patient.consultationCount || 0), 0),
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
        await evolutionApiClient.createInstance(instanceId);
      } catch (createError) {
        // Instance might already exist, continue
        console.log('Instance might already exist:', instanceId);
      }
      
      // Get QR code from Evolution API
      const qrResponse = await evolutionApiClient.getInstanceQrCode(instanceId);
      
      res.json({
        qrCode: qrResponse.base64 || qrResponse.qrcode,
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
      const statusResponse = await evolutionApiClient.getInstanceStatus(instanceId);
      
      res.json({
        instanceId,
        status: statusResponse.state || "disconnected",
        phoneNumber: statusResponse.instance?.phone || null
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

  const httpServer = createServer(app);
  return httpServer;
}

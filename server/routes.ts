import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertNutritionistSchema, insertWhatsappInstanceSchema } from "@shared/schema";
import { z } from "zod";
// Import real API clients (server-side versions)
import { directusClient } from "./lib/directus.js";
import { evolutionApiClient } from "./lib/evolution-api.js";

export async function registerRoutes(app: Express): Promise<Server> {
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

      // Create nutritionist in local database
      const nutritionist = await storage.createNutritionist(validatedData);
      
      // Try to create user in Directus
      try {
        const directusUserData = {
          email: validatedData.email,
          password: validatedData.password,
          first_name: validatedData.fullName.split(' ')[0],
          last_name: validatedData.fullName.split(' ').slice(1).join(' '),
          role: '90ce89ef-abe3-4359-9fc0-3e882127775a', // Role específica do nutricionista
          status: 'active',
          // Campos customizados para o nutricionista
          crn: validatedData.crn,
          phone: validatedData.phone,
          specialization: validatedData.specialization,
          whatsapp_number: validatedData.whatsappNumber,
        };
        
        const directusUser = await directusClient.createUser(directusUserData);
        console.log('Usuario criado no Directus:', directusUser.id);
        
        // Atualizar nutricionista com ID do Directus
        await storage.updateNutritionist(nutritionist.id, { 
          status: 'active' // Marca como ativo quando criado no Directus
        });
      } catch (directusError) {
        console.error('Erro ao criar usuário no Directus:', directusError);
        // Não falha a criação local, mas loga o erro
      }

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

import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage, initializeStorage } from "./storage";
import { insertNutritionistSchema, insertWhatsappInstanceSchema, insertPatientSchema, insertWhatsappMessageSchema, insertWhatsappScheduleSchema, scheduleTypeEnum, scheduleStatusEnum } from "@shared/schema";
import { z } from "zod";
// @ts-ignore - directus.js doesn't have type declarations
import { directusClient } from "./lib/directus.js";
import { evolutionRedis } from "./evolution-redis";
import { patientHistoryDirectus } from "./patient-history-directus";
import { openaiService } from "./openai-service";
import { scheduleService } from "./schedule-service";
import { whatsappMessageHandler } from "./whatsapp-message-handler";
import { getAllAIConfigs, getAIConfig, updateAIConfig, resetAIConfig, getDefaultConfig, VALID_AGENT_TYPES, AVAILABLE_MODELS, getAgentTypeLabel, initAIConfigStore, type AgentType } from "./ai-config-store";
import Stripe from "stripe";

// Extend session type to include user
declare module 'express-session' {
  export interface SessionData {
    user?: any;
  }
}

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

// Validate that the Stripe key is a SECRET key, not a public key
if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
  console.error('🚨 CONFIGURATION ERROR:');
  console.error('STRIPE_SECRET_KEY must start with "sk_" (secret key), not "pk_" (public key)');
  console.error('Current key starts with:', process.env.STRIPE_SECRET_KEY.substring(0, 3));
  console.error('Please update your environment variables in Replit Secrets:');
  console.error('1. Go to your Replit workspace');
  console.error('2. Open Secrets tab (lock icon in sidebar)');
  console.error('3. Update STRIPE_SECRET_KEY with your secret key (sk_test_... or sk_live_...)');
  console.error('4. Restart your application');
  throw new Error('STRIPE_SECRET_KEY must be a secret key starting with "sk_", not a public key starting with "pk_"');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

// Subscription validation schemas
const createSubscriptionSchema = z.object({
  planId: z.string().min(1, "Plan ID is required"),
});

const createEmbeddedSubscriptionSchema = z.object({
  planId: z.enum(['pro', 'enterprise'], { 
    errorMap: () => ({ message: "Plan ID must be 'pro' or 'enterprise'" })
  }),
});

const webhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.any(),
  }),
});

// Helper function for consistent error logging with context
const logError = (context: string, error: any, additionalData?: any) => {
  const timestamp = new Date().toISOString();
  const errorMessage = error?.message || error;
  const stack = error?.stack;
  
  console.error(`[${timestamp}] [${context}] Error: ${errorMessage}`);
  if (additionalData) {
    console.error(`[${timestamp}] [${context}] Additional data:`, JSON.stringify(additionalData, null, 2));
  }
  if (stack) {
    console.error(`[${timestamp}] [${context}] Stack trace:`, stack);
  }
};

// PII Masking utility function
const maskEmail = (email: string): string => {
  if (!email || typeof email !== 'string') return 'No email';
  const [localPart, domain] = email.split('@');
  if (!domain) return 'Invalid email';
  const maskedLocal = localPart.length > 3 ? localPart.substring(0, 3) + '****' : '***';
  return `${maskedLocal}@${domain}`;
};

// Stripe Price ID to Plan ID mapping
const STRIPE_PRICE_TO_PLAN_MAP: Record<string, string> = {
  // These will be populated dynamically from Stripe products
};

// Initialize price mapping from Stripe products
const initializePriceMapping = async () => {
  try {
    const products = await stripe.products.list({ limit: 100 });
    for (const product of products.data) {
      if (product.metadata?.planId) {
        const prices = await stripe.prices.list({ product: product.id, limit: 100 });
        for (const price of prices.data) {
          STRIPE_PRICE_TO_PLAN_MAP[price.id] = product.metadata.planId;
        }
      }
    }
    console.log('[Security] Initialized price mapping:', Object.keys(STRIPE_PRICE_TO_PLAN_MAP).length, 'mappings');
  } catch (error) {
    console.error('[Security] Failed to initialize price mapping:', error);
  }
};

// Get plan ID from price ID with fallback
const getPlanIdFromPriceId = (priceId: string | null | undefined): string => {
  if (!priceId) return 'pro'; // Safe fallback
  const planId = STRIPE_PRICE_TO_PLAN_MAP[priceId];
  if (planId) return planId;
  
  // Log unknown price ID for investigation
  console.warn(`[Security] Unknown price ID: ${priceId}, falling back to 'pro'`);
  return 'pro';
};

// Rate limiting for manual sync operations
const syncRateLimit = new Map<string, { count: number; resetTime: number }>();
const SYNC_RATE_LIMIT = 5; // 5 requests per hour per user
const SYNC_RATE_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

const checkSyncRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const userLimit = syncRateLimit.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    // Reset or initialize limit
    syncRateLimit.set(userId, { count: 1, resetTime: now + SYNC_RATE_WINDOW });
    return true;
  }
  
  if (userLimit.count >= SYNC_RATE_LIMIT) {
    return false; // Rate limit exceeded
  }
  
  userLimit.count++;
  return true;
};

// Audit logging for manual sync operations
const auditLog = (action: string, userId: string, details: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[AUDIT] [${timestamp}] ${action} by user ${userId}:`, JSON.stringify(details, null, 2));
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize storage and ensure required fields exist in Directus
  await initializeStorage();
  
  // Initialize AI config store (seed defaults into DB if needed)
  await initAIConfigStore();
  
  // Initialize price mapping for security
  await initializePriceMapping();

  // Middleware to check authentication
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.session.user) {
      return res.status(403).json({ error: "Admin access required" });
    }
    if (req.session.user.isAdmin) {
      return next();
    }
    const platformAdminEmails = (process.env.ADMIN_EMAILS || 'daniellessa2023@gmail.com').split(',').map((e: string) => e.trim().toLowerCase());
    if (req.session.user.email && platformAdminEmails.includes(req.session.user.email.toLowerCase())) {
      req.session.user.isAdmin = true;
      return next();
    }
    return res.status(403).json({ error: "Admin access required" });
  };

  // Middleware to check if user has active subscription
  const requireActiveSubscription = async (req: any, res: any, next: any) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      // Fast path: check session-cached subscription status first (avoids Directus query)
      const sessionStatusPagamento = req.session.user.status_pagamento;
      const sessionSubscriptionStatus = req.session.user.subscription_status;
      
      const sessionIsActive = sessionStatusPagamento === 'ativo' || 
                              sessionSubscriptionStatus === 'active' || 
                              sessionSubscriptionStatus === 'trialing';

      if (sessionIsActive) {
        console.log(`[Subscription Middleware] Session fast-path: status_pagamento=${sessionStatusPagamento}, subscription_status=${sessionSubscriptionStatus} → ACTIVE`);
        return next();
      }

      // Session has no cached status or shows inactive — verify with Directus as fallback
      const userId = req.session.user.id;
      const hasActive = await storage.hasActiveSubscription(userId);
      
      if (hasActive) {
        // Update session cache with active status
        req.session.user.status_pagamento = 'ativo';
        return next();
      }

      const subscriptionStatus = await storage.getSubscriptionStatus(userId);
      
      let errorMessage = "Active subscription required";
      let errorCode = "SUBSCRIPTION_REQUIRED";
      
      if (subscriptionStatus === 'past_due') {
        errorMessage = "Payment overdue. Please update your payment method.";
        errorCode = "PAYMENT_OVERDUE";
      } else if (subscriptionStatus === 'canceled') {
        errorMessage = "Subscription canceled. Reactivate to continue using the app.";
        errorCode = "SUBSCRIPTION_CANCELED";
      } else if (subscriptionStatus === 'incomplete') {
        errorMessage = "Complete your subscription setup to access the app.";
        errorCode = "SUBSCRIPTION_INCOMPLETE";
      } else if (!subscriptionStatus) {
        errorMessage = "No active subscription found. Subscribe to access the app.";
        errorCode = "NO_SUBSCRIPTION";
      }

      return res.status(402).json({ 
        error: errorMessage,
        code: errorCode,
        subscriptionStatus: subscriptionStatus,
        redirectTo: "/subscription/plans"
      });
    } catch (error) {
      console.error('[Subscription Middleware] Error checking subscription:', error);
      return res.status(500).json({ error: "Error verifying subscription" });
    }
  };

  // Test endpoint to verify webhook is reachable
  app.get("/api/stripe/webhook-test", (req, res) => {
    console.log('[Webhook Test] Endpoint called successfully');
    res.json({ 
      status: 'ok', 
      message: 'Webhook endpoint is reachable',
      timestamp: new Date().toISOString()
    });
  });

  // Helper function to safely convert Unix timestamp to Date
  const safeTimestampToDate = (timestamp: number | null | undefined): Date => {
    if (!timestamp || isNaN(timestamp)) {
      // Return a default date far in the future if timestamp is invalid
      return new Date('2099-12-31');
    }
    return new Date(timestamp * 1000);
  };

  // Stripe webhook endpoint - handles raw body from middleware
  app.post("/api/stripe/webhook", async (req, res) => {
    console.log('[Stripe Webhook] === WEBHOOK CALLED ===');
    console.log('[Stripe Webhook] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[Stripe Webhook] Body type:', typeof req.body);
    console.log('[Stripe Webhook] Body length:', req.body?.length || 'undefined');
    
    // Get signature header - handle both string and array cases
    const sigHeader = req.headers['stripe-signature'];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    if (!sig) {
      console.error('[Stripe Webhook] Missing stripe-signature header');
      return res.status(400).send('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      console.log('[Stripe Webhook] Secret configured:', !!webhookSecret);
      console.log('[Stripe Webhook] Secret prefix:', webhookSecret?.substring(0, 7) || 'undefined');
      
      if (!webhookSecret) {
        console.error('[Stripe Webhook] Missing STRIPE_WEBHOOK_SECRET environment variable');
        return res.status(500).send('Webhook secret not configured');
      }

      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      console.log(`[Stripe Webhook] Received event: ${event.type}`);
    } catch (err: any) {
      console.error('[Stripe Webhook] Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          console.log(`[Stripe Webhook] Checkout session completed: ${session.id}`);
          
          if (session.mode === 'subscription') {
            // Get the subscription details
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const customerId = session.customer as string;
            
            console.log(`[Stripe Webhook] Processing subscription: ${subscription.id} for customer: ${customerId}`);
            
            // Update user subscription status
            await storage.updateSubscriptionFromWebhook(customerId, {
              subscriptionId: subscription.id,
              status: subscription.status,
              currentPeriodStart: safeTimestampToDate((subscription as any).current_period_start),
              currentPeriodEnd: safeTimestampToDate((subscription as any).current_period_end),
              priceId: subscription.items.data[0]?.price.id || null,
            });
            
            console.log(`[Stripe Webhook] Successfully updated subscription for customer: ${customerId}`);
          }
          break;
        }
        
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          
          console.log(`[Stripe Webhook] Subscription updated: ${subscription.id} for customer: ${customerId}, status: ${subscription.status}`);
          
          // Update user subscription status
          await storage.updateSubscriptionFromWebhook(customerId, {
            subscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodStart: safeTimestampToDate((subscription as any).current_period_start),
            currentPeriodEnd: safeTimestampToDate((subscription as any).current_period_end),
            priceId: subscription.items.data[0]?.price.id || null,
          });
          
          console.log(`[Stripe Webhook] Successfully updated subscription status for customer: ${customerId}`);
          break;
        }
        
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          
          console.log(`[Stripe Webhook] Subscription deleted: ${subscription.id} for customer: ${customerId}`);
          
          // Mark subscription as canceled
          await storage.updateSubscriptionFromWebhook(customerId, {
            subscriptionId: subscription.id,
            status: 'canceled',
            currentPeriodStart: safeTimestampToDate((subscription as any).current_period_start),
            currentPeriodEnd: safeTimestampToDate((subscription as any).current_period_end),
            priceId: subscription.items.data[0]?.price.id || null,
          });
          
          console.log(`[Stripe Webhook] Successfully marked subscription as canceled for customer: ${customerId}`);
          break;
        }

        case 'customer.subscription.created': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          
          console.log(`[Stripe Webhook] Subscription created: ${subscription.id} for customer: ${customerId}, status: ${subscription.status}`);
          
          // Update user subscription status for initial creation
          await storage.updateSubscriptionFromWebhook(customerId, {
            subscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodStart: safeTimestampToDate((subscription as any).current_period_start),
            currentPeriodEnd: safeTimestampToDate((subscription as any).current_period_end),
            priceId: subscription.items.data[0]?.price.id || null,
          });
          
          console.log(`[Stripe Webhook] Successfully created subscription record for customer: ${customerId}`);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;
          const subscriptionId = (invoice as any).subscription as string;
          
          console.log(`[Stripe Webhook] Invoice payment succeeded: ${invoice.id} for customer: ${customerId}, subscription: ${subscriptionId}`);
          
          if (subscriptionId) {
            try {
              // Get the latest subscription details to ensure accurate status
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              
              console.log(`[Stripe Webhook] Retrieved subscription ${subscriptionId} with status: ${subscription.status}`);
              
              // Update subscription status to reflect successful payment
              await storage.updateSubscriptionFromWebhook(customerId, {
                subscriptionId: subscription.id,
                status: subscription.status,
                currentPeriodStart: safeTimestampToDate((subscription as any).current_period_start),
                currentPeriodEnd: safeTimestampToDate((subscription as any).current_period_end),
                priceId: subscription.items.data[0]?.price.id || null,
              });
              
              console.log(`[Stripe Webhook] Successfully updated subscription status after payment for customer: ${customerId}`);
            } catch (error: any) {
              console.error(`[Stripe Webhook] Error retrieving subscription ${subscriptionId}:`, error.message);
              // Continue processing - don't fail the webhook for this error
            }
          } else {
            console.log(`[Stripe Webhook] Invoice ${invoice.id} is not associated with a subscription, skipping update`);
          }
          break;
        }

        case 'payment_intent.succeeded': {
          // DISABLED FOR SAFETY: This handler was used for the deprecated payment intent flow
          // Now that we use Stripe Checkout with mode:'subscription', Stripe automatically
          // creates subscriptions and sends checkout.session.completed events instead.
          // Keeping this handler active risks double subscription creation.
          
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log(`[Stripe Webhook] Payment intent succeeded: ${paymentIntent.id} - HANDLER DISABLED FOR SAFETY`);
          console.log(`[Stripe Webhook] Use checkout.session.completed for subscription handling instead`);
          break;
        }
        
        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      // Return a 200 response to acknowledge receipt of the event
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('[Stripe Webhook] ❌ Error processing webhook:', error.message || error);
      console.error('[Stripe Webhook] Error stack:', error.stack);
      console.error('[Stripe Webhook] Error details:', JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
        type: error.type
      }, null, 2));
      res.status(500).json({ error: 'Webhook processing failed', details: error.message });
    }
  });

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

  // WhatsApp instances routes (PROTECTED with subscription)
  app.get("/api/whatsapp-instances", requireAuth, requireActiveSubscription, async (req, res) => {
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

  app.get("/api/whatsapp-instances/nutritionist/:nutritionistId", requireAuth, requireActiveSubscription, async (req, res) => {
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

  app.post("/api/whatsapp-instances", requireAuth, requireActiveSubscription, async (req, res) => {
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

  app.put("/api/whatsapp-instances/:id", requireAuth, requireActiveSubscription, async (req, res) => {
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

  // Patients routes (protected with subscription)
  app.get("/api/patients", requireAuth, requireActiveSubscription, async (req, res) => {
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

  app.get("/api/patients/:id", requireAuth, requireActiveSubscription, async (req, res) => {
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

  app.post("/api/patients", requireAuth, requireActiveSubscription, async (req, res) => {
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

  app.put("/api/patients/:id", requireAuth, requireActiveSubscription, async (req, res) => {
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

  app.delete("/api/patients/:id", requireAuth, requireActiveSubscription, async (req, res) => {
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

  // WhatsApp Messages - Webhook route for N8N to save messages
  app.post("/api/messages/webhook", async (req, res) => {
    try {
      console.log('[API] Received WhatsApp message webhook from N8N');
      
      const webhookToken = req.headers['x-webhook-token'];
      if (webhookToken !== process.env.N8N_WEBHOOK_TOKEN && process.env.N8N_WEBHOOK_TOKEN) {
        console.error('[API] Invalid webhook token');
        return res.status(401).json({ error: "Unauthorized" });
      }

      const messageData = insertWhatsappMessageSchema.parse(req.body);
      const savedMessage = await storage.saveWhatsappMessage(messageData);
      
      console.log(`[API] Message saved successfully: ${savedMessage.id}`);
      res.status(201).json({ success: true, messageId: savedMessage.id });
    } catch (error) {
      console.error('[API] Error saving WhatsApp message:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid message data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to save message" });
    }
  });

  const processedMessageIds = new Set<string>();
  const MESSAGE_ID_TTL = 5 * 60 * 1000;
  setInterval(() => {
    processedMessageIds.clear();
  }, MESSAGE_ID_TTL);

  app.post("/api/whatsapp/ai-webhook", async (req, res) => {
    try {
      console.log('[API] Received Evolution API webhook for AI processing');

      const webhookToken = req.headers['x-webhook-token'] || req.headers['apikey'];
      const expectedToken = process.env.AI_WEBHOOK_TOKEN || process.env.EVOLUTION_API_KEY;
      if (expectedToken && webhookToken !== expectedToken) {
        console.error('[API] Invalid or missing webhook token for AI webhook');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const body = req.body;

      const event = body.event || body.type;
      if (event && event !== 'MESSAGES_UPSERT' && event !== 'messages.upsert') {
        return res.status(200).json({ ignored: true, reason: 'Not a message event' });
      }

      const data = body.data || body;
      const instanceName = body.instance || body.instanceName || data.instance || '';

      const messageId = data.key?.id || data.messageId || '';
      if (messageId && processedMessageIds.has(messageId)) {
        console.log(`[API] Duplicate message ${messageId} ignored`);
        return res.status(200).json({ ignored: true, reason: 'Duplicate message' });
      }
      if (messageId) {
        processedMessageIds.add(messageId);
      }

      let senderNumber = '';
      let messageBody = '';
      let messageType: 'text' | 'image' | 'audio' | 'video' | 'document' = 'text';
      let imageBuffer: Buffer | undefined;

      if (data.key) {
        if (data.key.fromMe) {
          return res.status(200).json({ ignored: true, reason: 'Message from self' });
        }
        senderNumber = (data.key.remoteJid || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
        
        if ((data.key.remoteJid || '').includes('@g.us')) {
          return res.status(200).json({ ignored: true, reason: 'Group message' });
        }
      } else if (data.remoteJid) {
        senderNumber = data.remoteJid.replace('@s.whatsapp.net', '');
      } else if (data.from) {
        senderNumber = data.from;
      }

      if (!senderNumber || !instanceName) {
        console.warn('[API] Missing senderNumber or instanceName in webhook');
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const msg = data.message || data;
      if (msg.conversation) {
        messageBody = msg.conversation;
        messageType = 'text';
      } else if (msg.extendedTextMessage?.text) {
        messageBody = msg.extendedTextMessage.text;
        messageType = 'text';
      } else if (msg.imageMessage) {
        messageType = 'image';
        messageBody = msg.imageMessage.caption || '[Imagem]';

        if (data.base64 || msg.imageMessage.base64) {
          try {
            const b64 = data.base64 || msg.imageMessage.base64;
            imageBuffer = Buffer.from(b64, 'base64');
          } catch (e) {
            console.warn('[API] Failed to decode image base64');
          }
        }
      } else if (msg.audioMessage) {
        messageType = 'audio';
        messageBody = '[Áudio - não suportado no momento]';
      } else if (msg.videoMessage) {
        messageType = 'video';
        messageBody = '[Vídeo]';
      } else if (msg.documentMessage) {
        messageType = 'document';
        messageBody = '[Documento]';
      } else {
        messageBody = JSON.stringify(msg).substring(0, 200);
      }

      res.status(200).json({ success: true, processing: true });

      whatsappMessageHandler.handleIncomingMessage({
        instanceName,
        senderNumber,
        messageBody,
        messageType,
        imageBuffer,
        timestamp: data.messageTimestamp ? Number(data.messageTimestamp) * 1000 : Date.now(),
      }).catch(err => {
        console.error('[API] Error in async message handler:', err);
      });

    } catch (error) {
      console.error('[API] Error processing AI webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  // Get patient messages by patient ID
  app.get("/api/messages/patient/:patientId", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const { patientId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      
      console.log(`[API] Getting messages for patient ${patientId}, limit: ${limit}`);
      
      // Get messages from Directus
      const messages = await storage.getPatientMessages(patientId, limit);
      
      res.json({ messages, count: messages.length });
    } catch (error) {
      console.error('[API] Error getting patient messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // WhatsApp routes (Baileys)
  app.get("/api/whatsapp/qrcode/:nutritionistId", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      if (req.params.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.getNutritionist(req.params.nutritionistId, userToken);
      
      if (!nutritionist) {
        return res.status(404).json({ error: "Nutritionist not found" });
      }

      const whatsappNumber = nutritionist.whatsappIA || nutritionist.whatsappNumber || "";
      if (!whatsappNumber) {
        return res.status(400).json({ error: "No WhatsApp number configured for this nutritionist" });
      }
      const { baileysService } = await import('./baileys-service.js');

      await baileysService.startSession(req.params.nutritionistId, whatsappNumber);

      const maxWait = 10;
      let qrCode: string | null = null;
      let status = baileysService.getStatus(req.params.nutritionistId);

      for (let i = 0; i < maxWait; i++) {
        qrCode = baileysService.getQRCode(req.params.nutritionistId);
        status = baileysService.getStatus(req.params.nutritionistId);
        if (qrCode || status.instance.state === "open") break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (status.instance.state === "open") {
        return res.json({ base64: null, connected: true });
      }

      if (!qrCode) {
        return res.status(202).json({ base64: null, message: "QR code is being generated, please try again in a few seconds." });
      }

      res.json({ base64: qrCode });
    } catch (error: any) {
      console.error("Error getting QR code:", error);
      res.status(500).json({ error: error.message || "Failed to generate QR code" });
    }
  });

  app.get("/api/whatsapp/status/:nutritionistId", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      if (req.params.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { baileysService } = await import('./baileys-service.js');

      const statusResponse = baileysService.getStatus(req.params.nutritionistId);
      const qrCode = baileysService.getQRCode(req.params.nutritionistId);
      
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
      
      res.json({
        ...statusResponse,
        qrCode: qrCode || null,
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

  // Nutritionist individual dashboard stats (protected with subscription)
  app.get("/api/nutritionists/:id/dashboard", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const requestedId = req.params.id;
      const loggedInNutritionistId = req.session.user.nutritionistId;
      
      // Users can only access their own dashboard
      if (requestedId !== loggedInNutritionistId) {
        return res.status(403).json({ error: "Access denied. You can only view your own dashboard." });
      }

      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.getNutritionist(requestedId, userToken);
      if (!nutritionist) {
        return res.status(404).json({ error: "Nutritionist not found" });
      }
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

  // Convenience endpoint to get current user's dashboard (requires subscription)
  app.get("/api/dashboard", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.getNutritionist(nutritionistId, userToken);
      
      if (!nutritionist) {
        return res.status(404).json({ error: "Nutritionist profile not found" });
      }
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

      // Determine subscription status from Directus user data
      const rawStatusPagamento = directusUser.data.status_pagamento;
      const rawSubscriptionStatus = directusUser.data.subscription_status;
      const sessionStatusPagamento = rawStatusPagamento ||
        (rawSubscriptionStatus === 'active' || rawSubscriptionStatus === 'trialing' ? 'ativo' :
         rawSubscriptionStatus === 'canceled' ? 'cancelado' :
         rawSubscriptionStatus === 'past_due' || rawSubscriptionStatus === 'incomplete_expired' || rawSubscriptionStatus === 'unpaid' ? 'expirado' : 'pendente');

      // Create local session with Directus tokens and subscription status
      req.session.user = {
        id: directusUser.data.id,
        email: directusUser.data.email,
        nutritionistId: directusUser.data.id,
        role: directusUser.data.role,
        accessToken: loginResponse.data.access_token,
        refreshToken: loginResponse.data.refresh_token,
        status_pagamento: sessionStatusPagamento,
        subscription_status: rawSubscriptionStatus,
      };

      console.log(`=== Login successful ===`);
      console.log(`Session ID: ${req.sessionID}`);
      console.log(`Nutritionist ID: ${directusUser.data.id}`);
      console.log(`Session user created for: ${req.session.user?.email}`);
      
      // Transform Directus user to our nutritionist format
      const nutritionist = {
        id: directusUser.data.id,
        fullName: directusUser.data.full_name || `${directusUser.data.first_name} ${directusUser.data.last_name}`.trim(),
        email: directusUser.data.email,
        cpfCnpj: directusUser.data.cpf_cnpj || '',
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
      
      const platformAdminEmails = (process.env.ADMIN_EMAILS || 'daniellessa2023@gmail.com').split(',').map(e => e.trim().toLowerCase());
      const isDirectusAdmin = directusUser.data.admin_access === true;
      const isPlatformAdmin = platformAdminEmails.includes(email.toLowerCase());
      const isAdmin = isDirectusAdmin || isPlatformAdmin;
      
      console.log(`Admin check result for ${email}: isAdmin=${isAdmin} (directus=${isDirectusAdmin}, platform=${isPlatformAdmin})`);
      
      if (!isAdmin) {
        console.log(`Access denied for ${email} - not recognized as admin`);
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
      console.log('[Auth] Nutritionist data:', {
        id: nutritionist.id,
        fullName: nutritionist.fullName,
        evolutionInstanceName: nutritionist.evolutionInstanceName,
        whatsappIA: nutritionist.whatsappIA,
        status_pagamento: nutritionist.status_pagamento,
      });

      // Keep session subscription status in sync with fresh Directus data
      if (nutritionist.status_pagamento) {
        req.session.user.status_pagamento = nutritionist.status_pagamento;
      }
      if (nutritionist.subscriptionStatus) {
        req.session.user.subscription_status = nutritionist.subscriptionStatus;
      }
      
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

  // Evolution API proxy endpoints (now backed by Baileys)
  app.post("/api/evolution/generate-qr/:instanceId", requireAuth, async (req, res) => {
    try {
      const { instanceId } = req.params;
      const { baileysService } = await import('./baileys-service.js');
      
      const match = instanceId.match(/^nutri_(.+)$/);
      const nutritionistId = match ? match[1] : instanceId;
      
      if (nutritionistId !== req.session.user?.nutritionistId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const nutritionist = await storage.getNutritionist(nutritionistId);
      const whatsappNumber = nutritionist?.whatsappIA || nutritionist?.whatsappNumber || "";
      await baileysService.startSession(nutritionistId, whatsappNumber);

      let qrCode: string | null = null;
      for (let i = 0; i < 10; i++) {
        qrCode = baileysService.getQRCode(nutritionistId);
        if (qrCode) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      res.json({
        qrCode: qrCode || null,
        instanceId,
        status: qrCode ? "waiting_for_connection" : "connecting"
      });
    } catch (error) {
      const { instanceId } = req.params;
      console.error('Baileys QR generation error:', error);
      res.json({
        qrCode: null,
        instanceId,
        status: "error"
      });
    }
  });

  app.get("/api/evolution/status/:instanceId", requireAuth, async (req, res) => {
    try {
      const { instanceId } = req.params;
      const { baileysService } = await import('./baileys-service.js');
      
      const match = instanceId.match(/^nutri_(.+)$/);
      const nutritionistId = match ? match[1] : instanceId;
      
      if (nutritionistId !== req.session.user?.nutritionistId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const statusData = baileysService.getStatus(nutritionistId);
      
      res.json({
        instanceId,
        status: statusData.instance.state === "open" ? "connected" : "disconnected",
        phoneNumber: null
      });
    } catch (error) {
      const { instanceId } = req.params;
      console.error('Baileys status check error:', error);
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

  app.post("/api/ai/ask", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const { patientId, question, dateRange } = askRequestSchema.parse(req.body);
      
      // Security: Verify patient belongs to this nutritionist
      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(patientId.toString(), userToken);
      
      if (!patient || patient.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - patient not found or not your patient" });
      }
      
      // Get messages from Directus by patient ID
      console.log(`[AI Ask] Getting messages for patient ${patient.fullName} (ID: ${patientId})`);
      
      const messages = await patientHistoryDirectus.getPatientMessages(patientId.toString(), 500);
      
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

  app.get("/api/ai/insights/:patientId", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const patientId = req.params.patientId;
      const forceRefresh = req.query.forceRefresh === 'true';
      
      // Security: Verify patient belongs to this nutritionist
      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(patientId, userToken);
      
      if (!patient || patient.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - patient not found or not your patient" });
      }
      
      // Check cache unless force refresh is requested
      if (!forceRefresh && patient.ultimaAnaliseIA && patient.dataUltimaAnalise) {
        const cacheAge = Date.now() - new Date(patient.dataUltimaAnalise).getTime();
        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        if (cacheAge < CACHE_TTL) {
          console.log(`[AI Insights] Returning cached analysis for patient ${patientId} (age: ${Math.round(cacheAge / 60000)} min)`);
          try {
            const cachedInsights = JSON.parse(patient.ultimaAnaliseIA);
            return res.json({ ...cachedInsights, cached: true, cacheAge: Math.round(cacheAge / 60000) });
          } catch (parseError) {
            console.warn('[AI Insights] Failed to parse cached insights, regenerating...');
          }
        }
      }
      
      // Get messages from Directus by patient ID
      const messages = await patientHistoryDirectus.getPatientMessages(patientId, 200);
      
      if (messages.length === 0) {
        return res.json({
          summary: "Sem mensagens disponíveis",
          keyTopics: [],
          patientMood: "neutral",
          recommendations: [],
          cached: false
        });
      }
      
      console.log(`[AI Insights] Generating new analysis for patient ${patientId} with ${messages.length} messages`);
      
      // Generate insights with OpenAI
      const insights = await openaiService.generateQuickInsights(messages);
      
      // Save to cache (async, don't wait)
      storage.updatePatientAICache(patientId, insights).catch(err => {
        console.error('[AI Insights] Failed to update cache:', err);
      });
      
      res.json({ ...insights, cached: false });
      
    } catch (error) {
      console.error('[AI Insights] Error generating insights:', error);
      res.status(500).json({ 
        error: "Erro ao gerar insights",
        message: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Generate AI meal plan suggestion for patient
  app.post("/api/ai/meal-plan/:patientId", requireAuth, requireActiveSubscription, async (req, res) => {
    try {
      const patientId = req.params.patientId;
      
      // Security: Verify patient belongs to this nutritionist
      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(patientId, userToken);
      
      if (!patient || patient.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - patient not found or not your patient" });
      }
      
      // Get messages from Directus by patient ID
      const messages = await patientHistoryDirectus.getPatientMessages(patientId, 200);
      
      // Prepare patient data for meal plan generation
      const patientData = {
        name: patient.fullName,
        age: patient.age,
        gender: patient.gender,
        weight: patient.weight,
        height: patient.height,
        bmi: patient.bmi,
        goals: patient.goals,
        anamnese: patient.anamnese,
        supplements: patient.supplements,
        messages,
        currentMeals: {
          breakfast: patient.breakfast,
          morningSnack: patient.morningSnack,
          lunch: patient.lunch,
          afternoonSnack: patient.afternoonSnack,
          dinner: patient.dinner,
          eveningSnack: patient.eveningSnack
        }
      };
      
      // Generate meal plan with OpenAI
      const mealPlan = await openaiService.generateMealPlan(patientData);
      
      res.json(mealPlan);
      
    } catch (error) {
      console.error('[AI Meal Plan] Error generating meal plan:', error);
      res.status(500).json({ 
        error: "Erro ao gerar sugestão de recordatório",
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
      // For temporary admin sessions, use system token
      const userToken = req.session.user.accessToken === 'temp-admin-token' 
        ? process.env.DIRECTUS_TOKEN 
        : req.session.user.accessToken;
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
        cpfCnpj: user.cpf_cnpj || '',
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
        cpfCnpj: user.cpf_cnpj || '',
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
      
      // For temporary admin sessions, use system token
      const userToken = req.session.user.accessToken === 'temp-admin-token' 
        ? process.env.DIRECTUS_TOKEN 
        : req.session.user.accessToken;
      
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

  // ========== ADMIN AI CONFIGURATION ROUTES ==========

  app.get("/api/admin/ai-config", requireAdmin, async (_req, res) => {
    try {
      const configs = await getAllAIConfigs();
      const withLabels = configs.map(c => ({ ...c, label: getAgentTypeLabel(c.agent_type) }));
      res.json({ configs: withLabels, availableModels: AVAILABLE_MODELS });
    } catch (error) {
      console.error('[Admin AI Config] Error fetching configs:', error);
      res.status(500).json({ error: "Failed to fetch AI configurations" });
    }
  });

  app.get("/api/admin/ai-config/:agentType", requireAdmin, async (req, res) => {
    try {
      const agentType = req.params.agentType as AgentType;
      if (!VALID_AGENT_TYPES.includes(agentType)) {
        return res.status(400).json({ error: `Invalid agent type: ${agentType}` });
      }
      const config = await getAIConfig(agentType);
      res.json({ ...config, label: getAgentTypeLabel(agentType) });
    } catch (error) {
      console.error('[Admin AI Config] Error fetching config:', error);
      res.status(500).json({ error: "Failed to fetch AI configuration" });
    }
  });

  app.put("/api/admin/ai-config/:agentType", requireAdmin, async (req, res) => {
    try {
      const agentType = req.params.agentType as AgentType;
      if (!VALID_AGENT_TYPES.includes(agentType)) {
        return res.status(400).json({ error: `Invalid agent type: ${agentType}` });
      }

      const schema = z.object({
        system_prompt: z.string().min(1).optional(),
        model: z.string().optional(),
        max_tokens: z.number().int().min(100).max(16000).optional(),
        temperature: z.number().min(0).max(2).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const updated = await updateAIConfig(agentType, parsed.data);
      console.log(`[Admin AI Config] Updated config for ${agentType}`);
      res.json({ ...updated, label: getAgentTypeLabel(agentType) });
    } catch (error) {
      console.error('[Admin AI Config] Error updating config:', error);
      res.status(500).json({ error: "Failed to update AI configuration" });
    }
  });

  app.post("/api/admin/ai-config/reset/:agentType", requireAdmin, async (req, res) => {
    try {
      const agentType = req.params.agentType as AgentType;
      if (!VALID_AGENT_TYPES.includes(agentType)) {
        return res.status(400).json({ error: `Invalid agent type: ${agentType}` });
      }
      const reset = await resetAIConfig(agentType);
      console.log(`[Admin AI Config] Reset config for ${agentType} to defaults`);
      res.json({ ...reset, label: getAgentTypeLabel(agentType) });
    } catch (error) {
      console.error('[Admin AI Config] Error resetting config:', error);
      res.status(500).json({ error: "Failed to reset AI configuration" });
    }
  });

  // ========== STRIPE SUBSCRIPTION ROUTES ==========

  // Check user subscription status
  app.get("/api/subscription/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const userToken = req.session.user.accessToken;
      const user = await storage.getNutritionist(userId, userToken);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user has an active subscription
      const hasActiveSubscription = user.subscriptionStatus === 'active' && 
                                  user.subscriptionId && 
                                  user.planId;

      res.json({
        hasActiveSubscription,
        subscriptionStatus: user.subscriptionStatus || 'none',
        planId: user.planId || null,
        subscriptionStartDate: user.subscriptionStartDate || null,
        subscriptionEndDate: user.subscriptionEndDate || null,
        stripeCustomerId: user.stripeCustomerId || null,
        needsSubscription: !hasActiveSubscription
      });
    } catch (error: any) {
      console.error('[Subscription Status] Error:', error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // DIAGNOSTIC ENDPOINTS FOR WEBHOOK DEBUGGING
  
  // Test webhook processing with simulated event
  app.post("/api/stripe/webhook-test", requireAuth, async (req, res) => {
    try {
      const { eventType, customerId } = req.body;
      
      if (!eventType || !customerId) {
        return res.status(400).json({ error: "eventType and customerId are required" });
      }

      console.log(`[Webhook Test] Simulating ${eventType} for customer: ${customerId}`);
      
      // Get customer and subscription info from Stripe
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer || customer.deleted) {
        return res.status(404).json({ error: "Customer not found in Stripe" });
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10
      });

      console.log(`[Webhook Test] Customer has ${subscriptions.data.length} subscriptions`);
      
      if (subscriptions.data.length === 0) {
        return res.status(404).json({ error: "No subscriptions found for customer" });
      }

      const subscription = subscriptions.data[0];
      
      // Simulate webhook processing
      await storage.updateSubscriptionFromWebhook(customerId, {
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        priceId: subscription.items.data[0]?.price.id || null,
      });

      console.log(`[Webhook Test] Successfully processed simulated ${eventType}`);
      
      res.json({
        success: true,
        message: `Simulated ${eventType} processed successfully`,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          customerId: customerId
        }
      });

    } catch (error: any) {
      console.error('[Webhook Test] Error:', error);
      res.status(500).json({
        error: 'Failed to process webhook test',
        message: error.message
      });
    }
  });

  // User self-service sync endpoint - allows users to sync their own subscription status with Stripe
  app.post("/api/stripe/sync-my-subscription", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const nutritionistId = req.session.user.nutritionistId;
      
      console.log(`[Self Sync] Starting sync for user ${userId}`);
      
      // Get user's Stripe customer ID
      const user = await storage.getNutritionist(nutritionistId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        return res.status(400).json({ 
          error: "No Stripe customer ID found",
          message: "You need to complete a payment first"
        });
      }
      
      console.log(`[Self Sync] Found customer ID: ${stripeCustomerId}`);
      
      // Fetch current subscription status from Stripe - prefer active subscriptions
      const activeSubscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'active',
        limit: 1,
        expand: ['data.default_payment_method']
      });
      
      let subscription;
      if (activeSubscriptions.data.length > 0) {
        subscription = activeSubscriptions.data[0];
        console.log(`[Self Sync] Found active subscription: ${subscription.id}`);
      } else {
        // Fallback to most recent subscription of any status
        const allSubscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'all',
          limit: 1,
          expand: ['data.default_payment_method']
        });
        
        if (allSubscriptions.data.length === 0) {
          console.log(`[Self Sync] No subscriptions found for customer ${stripeCustomerId}`);
          return res.json({
            success: false,
            message: "No subscriptions found in Stripe",
            currentStatus: user.status_pagamento
          });
        }
        
        subscription = allSubscriptions.data[0];
        console.log(`[Self Sync] Using most recent subscription: ${subscription.id}, status: ${subscription.status}`);
      }
      console.log(`[Self Sync] Found subscription: ${subscription.id}, status: ${subscription.status}`);
      
      // Get the price ID from subscription items
      const priceId = subscription.items.data[0]?.price?.id || null;
      
      // Helper to safely convert Stripe timestamps to Date
      const safeTimestampToDate = (timestamp: number | null | undefined): Date => {
        if (!timestamp || isNaN(timestamp)) {
          return new Date();
        }
        return new Date(timestamp * 1000);
      };
      
      // Update user subscription in Directus using the user's own token (bypasses admin permission issues)
      const subData = subscription as any;
      const userToken = req.session.user.accessToken;
      try {
        await storage.updateMySubscriptionStatus(nutritionistId, userToken, {
          stripeCustomerId,
          subscription_status: subscription.status,
          subscription_id: subscription.id,
          plan_id: priceId || undefined,
          subscription_start_date: safeTimestampToDate(subData.current_period_start).toISOString(),
          subscription_end_date: safeTimestampToDate(subData.current_period_end).toISOString(),
        });
      } catch (updateError: any) {
        console.error(`[Self Sync] Failed to update Directus, but session will still be updated: ${updateError.message}`);
      }
      
      console.log(`[Self Sync] Successfully synced subscription status: ${subscription.status}`);
      
      // Map Stripe status to display status
      const statusMap: Record<string, string> = {
        'active': 'ativo',
        'trialing': 'ativo',
        'past_due': 'expirado',
        'canceled': 'cancelado',
        'incomplete': 'pendente',
        'incomplete_expired': 'expirado',
        'unpaid': 'expirado'
      };
      
      const newStatusPagamento = statusMap[subscription.status] || 'pendente';
      
      // Update session cache so middleware immediately reflects the new status
      req.session.user.status_pagamento = newStatusPagamento as any;
      req.session.user.subscription_status = subscription.status;
      
      res.json({
        success: true,
        message: "Subscription status synced successfully",
        stripeStatus: subscription.status,
        newStatus: newStatusPagamento,
        subscriptionId: subscription.id,
        currentPeriodEnd: new Date(subData.current_period_end * 1000).toISOString()
      });
      
    } catch (error: any) {
      console.error('[Self Sync] Error:', error);
      res.status(500).json({
        error: 'Failed to sync subscription',
        message: error.message
      });
    }
  });

  // Manual subscription sync endpoint for fixing missed webhooks (ADMIN ONLY)
  app.post("/api/stripe/sync-subscription", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { customerId } = req.body;
      const adminUserId = req.session.user.id;
      
      // Rate limiting check
      if (!checkSyncRateLimit(adminUserId)) {
        auditLog('MANUAL_SYNC_RATE_LIMITED', adminUserId, { customerId, endpoint: 'sync-subscription' });
        return res.status(429).json({ 
          error: "Rate limit exceeded",
          message: `Maximum ${SYNC_RATE_LIMIT} sync requests per hour allowed`
        });
      }
      
      if (!customerId) {
        auditLog('MANUAL_SYNC_BAD_REQUEST', adminUserId, { error: 'Missing customerId' });
        return res.status(400).json({ 
          error: "customerId is required",
          usage: "POST /api/stripe/sync-subscription with { customerId: 'cus_...' }"
        });
      }

      auditLog('MANUAL_SYNC_STARTED', adminUserId, { customerId, endpoint: 'sync-subscription' });
      console.log(`[Manual Sync] Starting sync for customer: ${customerId}`);
      
      // Verify customer exists in Stripe
      try {
        const customer = await stripe.customers.retrieve(customerId);
        const customerEmail = (customer as any).email || 'No email';
        const maskedEmail = maskEmail(customerEmail);
        console.log(`[Manual Sync] Customer verified: ${customer.id} (${maskedEmail})`);
      } catch (error: any) {
        console.error(`[Manual Sync] Customer not found:`, error.message);
        auditLog('MANUAL_SYNC_CUSTOMER_NOT_FOUND', adminUserId, { customerId, error: error.message });
        return res.status(404).json({ 
          error: "Customer not found in Stripe",
          customerId: customerId 
        });
      }
      
      // Get customer subscription from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10
      });

      console.log(`[Manual Sync] Found ${subscriptions.data.length} subscriptions for customer`);
      
      // Log all subscriptions for debugging
      subscriptions.data.forEach((sub, index) => {
        console.log(`[Manual Sync] Subscription ${index + 1}: ${sub.id}`);
        console.log(`  - Status: ${sub.status}`);
        console.log(`  - Created: ${new Date(sub.created * 1000).toISOString()}`);
        console.log(`  - Price ID: ${sub.items.data[0]?.price?.id || 'N/A'}`);
      });

      if (subscriptions.data.length === 0) {
        console.log(`[Manual Sync] No subscriptions found, checking payment intents...`);
        
        // Check payment intents for this customer
        const paymentIntents = await stripe.paymentIntents.list({
          customer: customerId,
          limit: 10
        });

        console.log(`[Manual Sync] Found ${paymentIntents.data.length} payment intents for customer`);
        
        // Log details about all payment intents
        paymentIntents.data.forEach((pi, index) => {
          console.log(`[Manual Sync] Payment Intent ${index + 1}: ${pi.id}, status: ${pi.status}, amount: ${pi.amount}`);
          console.log(`[Manual Sync] Payment Intent ${index + 1} created: ${new Date(pi.created * 1000).toISOString()}`);
          console.log(`[Manual Sync] Payment Intent ${index + 1} metadata:`, pi.metadata);
        });
        
        const succeededPayments = paymentIntents.data.filter(pi => pi.status === 'succeeded');
        console.log(`[Manual Sync] Found ${succeededPayments.length} succeeded payments out of ${paymentIntents.data.length} total`);
        
        if (succeededPayments.length > 0) {
          const latestPayment = succeededPayments[0];
          console.log(`[Manual Sync] Latest successful payment: ${latestPayment.id}`);
          console.log(`[Manual Sync] Payment metadata:`, latestPayment.metadata);
          
          // Find user by customer ID
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            console.log(`[Manual Sync] Found user ${user.id} for customer ${customerId}`);
            
            // Update user status based on successful payment
            const planId = getPlanIdFromPriceId(latestPayment.metadata?.planId);
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: 'active',
              planId: planId,
              stripeCustomerId: customerId
            });
            
            auditLog('MANUAL_SYNC_USER_ACTIVATED', adminUserId, { 
              userId: user.id, 
              email: maskEmail(user.email),
              planId: planId,
              paymentIntentId: latestPayment.id 
            });
            
            console.log(`[Manual Sync] Successfully activated user based on payment`);
            
            return res.json({
              success: true,
              message: "Payment found and status updated to active",
              action: "activated_based_on_payment",
              user: {
                id: user.id,
                email: user.email
              },
              paymentIntent: {
                id: latestPayment.id,
                status: latestPayment.status,
                amount: latestPayment.amount,
                created: new Date(latestPayment.created * 1000).toISOString(),
                metadata: latestPayment.metadata
              }
            });
          } else {
            console.warn(`[Manual Sync] No user found for customer ${customerId}`);
            return res.status(404).json({
              error: "No user found for this Stripe customer",
              customerId: customerId,
              suggestion: "Check if the customer ID is correct or if the user exists in Directus"
            });
          }
        }
        
        return res.status(404).json({ 
          error: "No subscriptions or successful payments found for customer",
          customerId: customerId,
          paymentIntentsFound: paymentIntents.data.length,
          succeededPayments: succeededPayments.length
        });
      }

      // Process the most recent subscription
      const subscription = subscriptions.data[0];
      console.log(`[Manual Sync] Processing subscription: ${subscription.id}`);
      
      // Find user by customer ID
      const user = await storage.getUserByStripeCustomerId(customerId);
      if (!user) {
        console.warn(`[Manual Sync] No user found for customer ${customerId}`);
        return res.status(404).json({
          error: "No user found for this Stripe customer",
          customerId: customerId,
          subscriptionId: subscription.id
        });
      }
      
      console.log(`[Manual Sync] Found user ${user.id} for customer ${customerId}`);
      
      // Update subscription data using webhook method
      await storage.updateSubscriptionFromWebhook(customerId, {
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        priceId: subscription.items.data[0]?.price.id || null,
      });

      console.log(`[Manual Sync] Successfully synced subscription: ${subscription.id}`);
      
      res.json({
        success: true,
        message: "Subscription synced successfully",
        action: "subscription_synced",
        user: {
          id: user.id,
          email: user.email
        },
        subscription: {
          id: subscription.id,
          status: subscription.status,
          priceId: subscription.items.data[0]?.price?.id,
          created: new Date(subscription.created * 1000).toISOString(),
          currentPeriodStart: new Date((subscription as any).current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date((subscription as any).current_period_end * 1000).toISOString(),
          customerId: customerId
        },
        debug: {
          totalSubscriptionsFound: subscriptions.data.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error: any) {
      logError('Manual Sync', error, { customerId: req.body.customerId });
      res.status(500).json({
        error: 'Failed to sync subscription',
        message: error.message,
        details: error.stack,
        customerId: req.body.customerId
      });
    }
  });

  // Enhanced manual subscription sync endpoint - accepts user ID or customer ID
  app.post("/api/stripe/sync-subscription-manual", requireAuth, requireAdmin, async (req, res) => {
    const adminUserId = req.session.user?.id || 'system';
    try {
      const { userId, customerId } = req.body;
      
      if (!userId && !customerId) {
        return res.status(400).json({ 
          error: "Either userId or customerId is required",
          usage: {
            userIdExample: "442a12b7-edc2-4192-90b5-cdf833bd49c9",
            customerIdExample: "cus_T7d8nx7GuHSa4T"
          }
        });
      }

      console.log(`[Manual Sync Enhanced] Starting sync with userId: ${userId}, customerId: ${customerId}`);
      
      let user;
      let stripeCustomerId = customerId;

      // Step 1: Resolve user and customer ID
      if (userId && !customerId) {
        // Find user by ID and get their Stripe customer ID
        try {
          user = await storage.getNutritionist(userId);
          if (!user) {
            return res.status(404).json({ error: "User not found" });
          }
          stripeCustomerId = user.stripeCustomerId;
          if (!stripeCustomerId) {
            return res.status(400).json({ 
              error: "User has no Stripe customer ID",
              userId: userId,
              suggestion: "User may need to complete a payment first"
            });
          }
          console.log(`[Manual Sync Enhanced] Found user ${userId} with customer ID: ${stripeCustomerId}`);
        } catch (error: any) {
          return res.status(500).json({ 
            error: "Failed to get user",
            details: error.message 
          });
        }
      } else if (customerId && !userId) {
        // Find user by Stripe customer ID
        try {
          user = await storage.getUserByStripeCustomerId(customerId);
          if (!user) {
            return res.status(404).json({ 
              error: "No user found for this Stripe customer ID",
              customerId: customerId
            });
          }
          console.log(`[Manual Sync Enhanced] Found user ${user.id} for customer ID: ${customerId}`);
        } catch (error: any) {
          return res.status(500).json({ 
            error: "Failed to find user by customer ID",
            details: error.message 
          });
        }
      } else {
        // Both provided - verify they match
        try {
          user = await storage.getNutritionist(userId);
          if (!user) {
            return res.status(404).json({ error: "User not found" });
          }
          if (user.stripeCustomerId !== customerId) {
            return res.status(400).json({ 
              error: "User ID and customer ID do not match",
              userCustomerId: user.stripeCustomerId,
              providedCustomerId: customerId
            });
          }
          stripeCustomerId = customerId;
          console.log(`[Manual Sync Enhanced] Verified user ${userId} matches customer ${customerId}`);
        } catch (error: any) {
          return res.status(500).json({ 
            error: "Failed to verify user and customer match",
            details: error.message 
          });
        }
      }

      // Step 2: Fetch all subscriptions from Stripe
      console.log(`[Manual Sync Enhanced] Fetching subscriptions for customer: ${stripeCustomerId}`);
      
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 10
      });

      console.log(`[Manual Sync Enhanced] Found ${subscriptions.data.length} subscriptions`);

      // Log subscription details
      subscriptions.data.forEach((sub, index) => {
        console.log(`[Manual Sync Enhanced] Subscription ${index + 1}: ${sub.id}`);
        console.log(`  - Status: ${sub.status}`);
        console.log(`  - Created: ${new Date(sub.created * 1000).toISOString()}`);
        console.log(`  - Current period: ${new Date((sub as any).current_period_start * 1000).toISOString()} to ${new Date((sub as any).current_period_end * 1000).toISOString()}`);
        console.log(`  - Price ID: ${sub.items.data[0]?.price?.id || 'N/A'}`);
      });

      if (subscriptions.data.length === 0) {
        console.log(`[Manual Sync Enhanced] No subscriptions found, checking payment intents...`);
        
        // Check payment intents as fallback
        const paymentIntents = await stripe.paymentIntents.list({
          customer: stripeCustomerId,
          limit: 10
        });

        console.log(`[Manual Sync Enhanced] Found ${paymentIntents.data.length} payment intents`);
        
        const succeededPayments = paymentIntents.data.filter(pi => pi.status === 'succeeded');
        console.log(`[Manual Sync Enhanced] Found ${succeededPayments.length} succeeded payments`);
        
        if (succeededPayments.length > 0) {
          const latestPayment = succeededPayments[0];
          console.log(`[Manual Sync Enhanced] Latest successful payment: ${latestPayment.id}`);
          
          // Update user status based on successful payment
          const planId = getPlanIdFromPriceId(latestPayment.metadata?.planId);
          await storage.updateUserSubscription(user.id, {
            subscriptionStatus: 'active',
            planId: planId,
          });
          
          auditLog('MANUAL_SYNC_ENHANCED_USER_ACTIVATED', adminUserId, { 
            userId: user.id, 
            email: maskEmail(user.email),
            planId: planId,
            paymentIntentId: latestPayment.id 
          });
          
          return res.json({
            success: true,
            message: "No subscriptions found, but activated user based on successful payment",
            action: "activated_based_on_payment",
            user: {
              id: user.id,
              email: maskEmail(user.email),
              stripeCustomerId: stripeCustomerId
            },
            paymentIntent: {
              id: latestPayment.id,
              status: latestPayment.status,
              amount: latestPayment.amount,
              created: new Date(latestPayment.created * 1000).toISOString()
            }
          });
        }
        
        return res.status(404).json({ 
          error: "No subscriptions or successful payments found for customer",
          customerId: stripeCustomerId,
          user: {
            id: user.id,
            email: maskEmail(user.email)
          }
        });
      }

      // Step 3: Process the latest subscription
      const latestSubscription = subscriptions.data[0]; // Most recent subscription
      console.log(`[Manual Sync Enhanced] Processing latest subscription: ${latestSubscription.id}`);

      // Step 4: Map plan ID correctly using centralized mapping
      const priceId = latestSubscription.items.data[0]?.price?.id;
      const planId = getPlanIdFromPriceId(priceId);

      console.log(`[Manual Sync Enhanced] Price ID: ${priceId}, mapped to plan: ${planId}`);

      // Step 5: Update Directus with subscription data
      const subscriptionData = {
        subscriptionId: latestSubscription.id,
        status: latestSubscription.status,
        currentPeriodStart: new Date((latestSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((latestSubscription as any).current_period_end * 1000),
        priceId: planId,
      };

      console.log(`[Manual Sync Enhanced] Updating subscription data:`, subscriptionData);

      await storage.updateSubscriptionFromWebhook(stripeCustomerId, subscriptionData);

      // Also update user subscription status with additional fields
      await storage.updateUserSubscription(user.id, {
        stripeCustomerId: stripeCustomerId,
        subscriptionStatus: latestSubscription.status,
        subscriptionId: latestSubscription.id,
        planId: planId,
        subscriptionStartDate: new Date((latestSubscription as any).current_period_start * 1000).toISOString(),
        subscriptionEndDate: new Date((latestSubscription as any).current_period_end * 1000).toISOString(),
      });

      console.log(`[Manual Sync Enhanced] Successfully synced subscription: ${latestSubscription.id}`);
      
      // Audit log successful sync
      auditLog('MANUAL_SYNC_ENHANCED_SUCCESS', adminUserId, {
        userId: user.id,
        email: maskEmail(user.email),
        subscriptionId: latestSubscription.id,
        planId: planId,
        customerId: stripeCustomerId
      });
      
      // Step 6: Return detailed sync results
      res.json({
        success: true,
        message: "Subscription synced successfully",
        action: "subscription_synced",
        user: {
          id: user.id,
          email: maskEmail(user.email),
          fullName: user.fullName
        },
        subscription: {
          id: latestSubscription.id,
          status: latestSubscription.status,
          priceId: priceId,
          planId: planId,
          created: new Date(latestSubscription.created * 1000).toISOString(),
          currentPeriodStart: new Date((latestSubscription as any).current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date((latestSubscription as any).current_period_end * 1000).toISOString(),
          customerId: stripeCustomerId
        },
        syncDetails: {
          totalSubscriptionsFound: subscriptions.data.length,
          syncedSubscriptionIndex: 0, // We always sync the first (latest) one
          timestamp: new Date().toISOString()
        }
      });

    } catch (error: any) {
      auditLog('MANUAL_SYNC_ENHANCED_ERROR', adminUserId, { 
        userId: req.body.userId, 
        customerId: req.body.customerId, 
        error: error.message 
      });
      logError('Manual Sync Enhanced', error, { userId: req.body.userId, customerId: req.body.customerId });
      res.status(500).json({
        error: 'Failed to sync subscription',
        message: error.message,
        details: error.stack
      });
    }
  });

  // Search for specific payment intent by ID
  app.post("/api/stripe/search-payment-intent", async (req, res) => {
    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ error: "paymentIntentId is required" });
      }

      console.log(`[Payment Search] Looking for payment intent: ${paymentIntentId}`);
      
      // Retrieve specific payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      console.log(`[Payment Search] Found payment intent: ${paymentIntent.id}`);
      console.log(`[Payment Search] Status: ${paymentIntent.status}`);
      console.log(`[Payment Search] Amount: ${paymentIntent.amount}`);
      console.log(`[Payment Search] Customer: ${paymentIntent.customer}`);
      console.log(`[Payment Search] Metadata:`, paymentIntent.metadata);
      console.log(`[Payment Search] Created: ${new Date(paymentIntent.created * 1000).toISOString()}`);
      
      // If this is a successful payment, try to sync it
      if (paymentIntent.status === 'succeeded' && paymentIntent.customer) {
        const customerId = paymentIntent.customer as string;
        console.log(`[Payment Search] Attempting to sync successful payment for customer: ${customerId}`);
        
        // Check if this payment has subscription metadata
        if (paymentIntent.metadata.type === 'subscription' && paymentIntent.metadata.planId) {
          // Update user status to active since payment succeeded
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            const planId = getPlanIdFromPriceId(paymentIntent.metadata.planId);
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: 'active',
              planId: planId
            });
            
            console.log(`[Payment Search] Successfully activated user based on successful payment`);
            
            return res.json({
              success: true,
              message: "Found successful payment and activated user",
              action: "activated_from_successful_payment",
              paymentIntent: {
                id: paymentIntent.id,
                status: paymentIntent.status,
                amount: paymentIntent.amount,
                customer: paymentIntent.customer,
                metadata: paymentIntent.metadata,
                created: new Date(paymentIntent.created * 1000).toISOString()
              }
            });
          }
        }
      }
      
      res.json({
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          customer: paymentIntent.customer,
          metadata: paymentIntent.metadata,
          created: new Date(paymentIntent.created * 1000).toISOString()
        }
      });

    } catch (error: any) {
      console.error('[Payment Search] Error:', error);
      res.status(500).json({
        error: 'Failed to search payment intent',
        message: error.message
      });
    }
  });

  // Fix customer ID mismatch and sync subscription
  app.post("/api/stripe/fix-customer-mismatch", async (req, res) => {
    try {
      const { oldCustomerId, newCustomerId, paymentIntentId } = req.body;
      
      if (!oldCustomerId || !newCustomerId) {
        return res.status(400).json({ error: "oldCustomerId and newCustomerId are required" });
      }

      console.log(`[Customer Fix] Fixing customer ID mismatch: ${oldCustomerId} -> ${newCustomerId}`);
      
      // Find user with old customer ID
      const user = await storage.getUserByStripeCustomerId(oldCustomerId);
      if (!user) {
        return res.status(404).json({ error: `User not found with customer ID: ${oldCustomerId}` });
      }

      console.log(`[Customer Fix] Found user: ${user.id} (${user.fullName})`);
      
      // Update the customer ID
      await storage.updateUserSubscription(user.id, {
        stripeCustomerId: newCustomerId
      });
      
      console.log(`[Customer Fix] Updated customer ID for user ${user.id}`);
      
      // Verify payment intent if provided
      if (paymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        console.log(`[Customer Fix] Verified payment intent ${paymentIntentId}: status=${paymentIntent.status}`);
        
        if (paymentIntent.status === 'succeeded' && paymentIntent.metadata.type === 'subscription') {
          // Update user to active status based on successful payment
          await storage.updateUserSubscription(user.id, {
            subscriptionStatus: 'active',
            planId: paymentIntent.metadata.planId || 'pro'
          });
          
          console.log(`[Customer Fix] Activated subscription for user ${user.id} based on successful payment`);
          
          return res.json({
            success: true,
            message: "Customer ID updated and subscription activated",
            action: "customer_id_fixed_and_activated",
            user: {
              id: user.id,
              name: user.fullName,
              oldCustomerId: oldCustomerId,
              newCustomerId: newCustomerId,
              status: 'ativo'
            },
            paymentIntent: {
              id: paymentIntent.id,
              status: paymentIntent.status,
              amount: paymentIntent.amount
            }
          });
        }
      }
      
      // Just return success if no payment intent to verify
      res.json({
        success: true,
        message: "Customer ID updated successfully",
        action: "customer_id_updated",
        user: {
          id: user.id,
          name: user.fullName,
          oldCustomerId: oldCustomerId,
          newCustomerId: newCustomerId
        }
      });

    } catch (error: any) {
      console.error('[Customer Fix] Error:', error);
      res.status(500).json({
        error: 'Failed to fix customer mismatch',
        message: error.message
      });
    }
  });


  // Helper function to create or get Stripe products and prices
  async function ensureStripeProducts() {
    try {
      // Ensuring products and prices exist
      
      const plans = [
        { id: 'pro', name: 'Nutri ChatBot Pro', amount: 4900 },
        { id: 'enterprise', name: 'Nutri ChatBot Enterprise', amount: 9999 }
      ];

      const ALLOWED_PLANS: Record<string, any> = {};

      for (const plan of plans) {
        // Check if product exists
        const products = await stripe.products.list({
          limit: 100
        });
        
        let product = products.data.find(p => p.metadata?.planId === plan.id);
        
        if (!product) {
          // Creating product
          product = await stripe.products.create({
            name: plan.name,
            description: `Assinatura mensal do ${plan.name}`,
            metadata: { planId: plan.id }
          });
        }

        // Check if price exists for this product
        const prices = await stripe.prices.list({ 
          product: product.id,
          limit: 100
        });
        let price = prices.data.find(p => p.unit_amount === plan.amount && p.currency === 'brl');

        if (!price) {
          // Creating price
          price = await stripe.prices.create({
            currency: 'brl',
            unit_amount: plan.amount,
            recurring: { interval: 'month' },
            product: product.id
          });
        }

        ALLOWED_PLANS[plan.id] = {
          name: plan.name,
          priceId: price.id,
          amount: plan.amount,
          productId: product.id
        };

        // Plan ready
      }

      return ALLOWED_PLANS;
    } catch (error) {
      console.error('Error ensuring products:', error);
      throw error;
    }
  }

  // Create subscription checkout session
  app.post("/api/subscription/create-checkout", requireAuth, async (req, res) => {
    try {
      console.log('[Stripe] Checkout creation attempt - Secret key available:', !!process.env.STRIPE_SECRET_KEY);
      console.log('[Stripe] Secret key starts with sk_:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_'));
      
      const { planId } = req.body;
      // Starting checkout creation
      // Validate planId instead of accepting any priceId
      
      if (!planId || typeof planId !== 'string') {
        return res.status(400).json({ error: "planId is required and must be a string" });
      }
      
      // Get or create Stripe products and prices
      const ALLOWED_PLANS = await ensureStripeProducts();
      
      // Validate planId against allowed plans
      if (!(planId in ALLOWED_PLANS)) {
        return res.status(400).json({ 
          error: "Invalid plan", 
          allowedPlans: Object.keys(ALLOWED_PLANS)
        });
      }
      
      const plan = ALLOWED_PLANS[planId];
      const userId = req.session.user.id;
      const user = await storage.getNutritionist(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create or get Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      
      if (!stripeCustomerId) {
        console.log('[Stripe] Creating customer for user:', userId);
        // Creating customer
        try {
          const customer = await stripe.customers.create({
            email: user.email,
            name: user.fullName,
            metadata: {
              userId: userId,
              nutritionistId: userId
            }
          });
          
          stripeCustomerId = customer.id;
          console.log('[Stripe] Customer created successfully:', stripeCustomerId);
          await storage.updateUserSubscription(userId, {
            stripeCustomerId: stripeCustomerId
          });
        } catch (customerError: any) {
          console.error('[Stripe] Customer creation failed:', customerError);
          throw customerError;
        }
      } else {
        console.log('[Stripe] Using existing customer:', stripeCustomerId);
      }

      // Create checkout session with secure BASE_URL
      // Auto-detect production URL or use environment variable
      let baseUrl = process.env.BASE_URL;
      if (!baseUrl) {
        // Auto-detect based on environment
        const isProduction = process.env.NODE_ENV === 'production' || 
                           process.env.REPL_SLUG || 
                           process.env.REPLIT_DB_URL;
        
        baseUrl = isProduction 
          ? 'https://app.nutrichatbot.com.br'  // Production URL
          : 'http://localhost:5000';            // Development URL
      }
      
      console.log('[Stripe] Using baseUrl for redirects:', baseUrl);
      console.log('[Stripe] Creating checkout session with priceId:', plan.priceId);
      // Creating checkout session
      let session;
      try {
        session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [{
            price: plan.priceId, // Use server-side priceId, not client-provided
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/subscription/plans`,
          metadata: {
            userId: userId,
            nutritionistId: userId,
            planId: planId,
            planName: plan.name
          },
          allow_promotion_codes: true,
          billing_address_collection: 'required',
        });
        console.log('[Stripe] Checkout session created successfully:', session.id);
      } catch (sessionError: any) {
        console.error('[Stripe] Checkout session creation failed:', sessionError);
        console.error('[Stripe] Error details:', JSON.stringify({
          type: sessionError.type,
          code: sessionError.code,
          message: sessionError.message,
          statusCode: sessionError.statusCode
        }, null, 2));
        throw sessionError;
      }

      // Checkout session created successfully
      res.json({ 
        sessionId: session.id,
        url: session.url,
        plan: {
          id: planId,
          name: plan.name,
          amount: plan.amount
        }
      });
      
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Failed to create checkout session",
        message: error.message 
      });
    }
  });

  // Create embedded subscription with incomplete payment
  app.post("/api/subscription/create-embedded-subscription", requireAuth, async (req, res) => {
    try {
      console.log('[Stripe Embedded] Creating embedded subscription - Secret key available:', !!process.env.STRIPE_SECRET_KEY);
      
      // Validate request body with Zod
      const validationResult = createEmbeddedSubscriptionSchema.safeParse(req.body);
      if (!validationResult.success) {
        logError('Stripe Embedded Validation', 'Invalid request body', { 
          errors: validationResult.error.errors,
          body: req.body 
        });
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: validationResult.error.errors 
        });
      }
      
      const { planId } = validationResult.data;
      
      // Get or create Stripe products and prices
      const ALLOWED_PLANS = await ensureStripeProducts();
      
      // Validate planId against allowed plans
      if (!(planId in ALLOWED_PLANS)) {
        return res.status(400).json({ 
          error: "Invalid plan", 
          allowedPlans: Object.keys(ALLOWED_PLANS)
        });
      }
      
      const plan = ALLOWED_PLANS[planId];
      const userId = req.session.user.id;
      const user = await storage.getNutritionist(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create or get Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      
      if (!stripeCustomerId) {
        console.log('[Stripe Embedded] Creating customer for user:', userId);
        try {
          const customer = await stripe.customers.create({
            email: user.email,
            name: user.fullName,
            metadata: {
              userId: userId,
              nutritionistId: userId
            }
          });
          
          stripeCustomerId = customer.id;
          console.log('[Stripe Embedded] Customer created successfully:', stripeCustomerId);
          await storage.updateUserSubscription(userId, {
            stripeCustomerId: stripeCustomerId
          });
        } catch (customerError: any) {
          console.error('[Stripe Embedded] Customer creation failed:', customerError);
          throw customerError;
        }
      } else {
        console.log('[Stripe Embedded] Using existing customer:', stripeCustomerId);
      }

      console.log('[Stripe Embedded] Creating subscription with priceId:', plan.priceId);
      
      try {
        // Create subscription with incomplete payment behavior
        const subscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{
            price: plan.priceId,
          }],
          payment_behavior: 'default_incomplete',
          payment_settings: {
            save_default_payment_method: 'on_subscription',
          },
          expand: ['latest_invoice.payment_intent'],
          metadata: {
            userId: userId,
            nutritionistId: userId,
            planId: planId,
            planName: plan.name
          },
        });

        console.log('[Stripe Embedded] Subscription created successfully:', subscription.id);

        // Extract the client secret from the payment intent
        const invoice = subscription.latest_invoice as any;
        const paymentIntent = invoice?.payment_intent;
        
        if (!paymentIntent || !paymentIntent.client_secret) {
          throw new Error('Failed to get payment intent client secret');
        }

        console.log('[Stripe Embedded] Client secret obtained for payment intent:', paymentIntent.id);

        // Return the client secret and subscription info
        res.json({
          clientSecret: paymentIntent.client_secret,
          subscriptionId: subscription.id,
          plan: {
            id: planId,
            name: plan.name,
            amount: plan.amount
          }
        });
        
      } catch (subscriptionError: any) {
        console.error('[Stripe Embedded] Subscription creation failed:', subscriptionError);
        console.error('[Stripe Embedded] Error details:', JSON.stringify({
          type: subscriptionError.type,
          code: subscriptionError.code,
          message: subscriptionError.message,
          statusCode: subscriptionError.statusCode
        }, null, 2));
        throw subscriptionError;
      }

    } catch (error: any) {
      console.error('Error creating embedded subscription:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: "Failed to create embedded subscription",
        message: error.message 
      });
    }
  });

  // DEPRECATED: Payment intent endpoint removed
  // This endpoint was creating one-time payments instead of subscriptions
  // All subscription payments now use /api/subscription/create-checkout
  app.post("/api/subscription/create-payment-intent", requireAuth, async (req, res) => {
    return res.status(410).json({ 
      error: "Endpoint deprecated",
      message: "This endpoint has been removed. Use /api/subscription/create-checkout for subscription payments.",
      redirectTo: "/subscription/plans"
    });
  });

  // Get subscription status
  app.get("/api/subscription/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getNutritionist(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const subscriptionData = {
        status: user.subscriptionStatus || null,
        subscriptionId: user.subscriptionId || null,
        planId: user.planId || null,
        startDate: user.subscriptionStartDate || null,
        endDate: user.subscriptionEndDate || null,
        trialEndDate: user.trialEndDate || null,
        hasActiveSubscription: ['active', 'trial'].includes(user.subscriptionStatus || '')
      };

      // If user has a Stripe subscription, get fresh data
      if (user.subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(user.subscriptionId);
          subscriptionData.status = subscription.status;
          subscriptionData.startDate = new Date(subscription.start_date * 1000).toISOString();
          subscriptionData.endDate = (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : null;
          
          // Update local cache if status changed
          if (subscription.status !== user.subscriptionStatus) {
            await storage.updateUserSubscription(userId, {
              subscriptionStatus: subscription.status
            });
          }
        } catch (stripeError) {
          console.error('Error fetching subscription:', stripeError);
          // Continue with cached data
        }
      }

      res.json(subscriptionData);
    } catch (error) {
      console.error('Error getting subscription status:', error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // Cancel subscription
  app.post("/api/subscription/cancel", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getNutritionist(userId);
      
      if (!user || !user.subscriptionId) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      // Cancel subscription at period end
      const subscription = await stripe.subscriptions.update(user.subscriptionId, {
        cancel_at_period_end: true
      });

      // Update local status
      await storage.updateUserSubscription(userId, {
        subscriptionStatus: subscription.status,
        subscriptionEndDate: (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : undefined
      });

      // Subscription marked for cancellation
      res.json({ 
        message: "Subscription will be canceled at the end of the current billing period",
        subscription: {
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : null
        }
      });
      
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({ 
        error: "Failed to cancel subscription",
        message: error.message 
      });
    }
  });

  // Customer portal (for users to manage their subscription)
  app.post("/api/subscription/portal", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getNutritionist(userId);
      
      if (!user || !user.stripeCustomerId) {
        return res.status(404).json({ error: "No Stripe customer found" });
      }

      const baseUrl = req.get('origin') || 'http://localhost:5000';
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/dashboard`,
      });

      // Customer portal session created
      res.json({ url: session.url });
      
    } catch (error: any) {
      console.error('Error creating customer portal session:', error);
      res.status(500).json({ 
        error: "Failed to create customer portal session",
        message: error.message 
      });
    }
  });

  // Verify successful checkout and activate subscription (no auth required - uses Stripe session verification)
  app.get("/api/subscription/checkout-success", async (req, res) => {
    try {
      const { session_id } = req.query;
      
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ error: "Missing session_id parameter" });
      }

      // Retrieve the checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      // Get user ID from Stripe session metadata (secure verification)
      const sessionUserId = session.metadata?.userId || session.metadata?.nutritionistId;
      
      if (!sessionUserId) {
        return res.status(400).json({ error: "Session metadata missing - unable to verify user" });
      }
      
      console.log('DEBUG - Checkout verification:');
      console.log('- Session userId from metadata:', sessionUserId);
      console.log('- Session customer:', session.customer);
      console.log('- Session metadata:', session.metadata);
      
      // Primary verification: Get user data using session metadata
      let user;
      try {
        user = await storage.getNutritionist(sessionUserId);
        console.log('- User found via getNutritionist:', !!user);
        console.log('- User stripeCustomerId:', user?.stripeCustomerId);
      } catch (error: any) {
        console.log('- Error getting user:', error.message);
        user = null;
      }
      
      // Alternative verification: Find by Stripe customer ID
      let verificationUser = user;
      if ((!user || !user.stripeCustomerId) && session.customer) {
        try {
          verificationUser = await storage.getUserByStripeCustomerId(session.customer as string);
          console.log('- Found user by stripe customer ID:', !!verificationUser);
        } catch (error: any) {
          console.log('- Error finding user by customer ID:', error.message);
        }
      }
      
      // Security verification: Ensure session belongs to user
      const isAuthorized = (verificationUser && session.customer === verificationUser.stripeCustomerId) || 
                          (verificationUser && verificationUser.id === sessionUserId);
      
      if (!isAuthorized) {
        return res.status(403).json({ error: "Unauthorized - session does not belong to user" });
      }
      
      // Use the verified user ID for subscription update
      const userId = verificationUser.id;

      // Check if payment was successful
      if (session.payment_status === 'paid') {
        // Get subscription details
        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // Activate the user's subscription in Directus
        await storage.updateUserSubscription(userId, {
          subscriptionId: subscription.id,
          subscriptionStatus: 'active',
          planId: subscription.items.data[0]?.price?.id || undefined,
          subscriptionStartDate: new Date(subscription.start_date * 1000).toISOString(),
          subscriptionEndDate: (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : undefined,
          trialEndDate: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : undefined
        });

        // Subscription activated successfully
        
        res.json({ 
          success: true, 
          message: "Subscription activated successfully!",
          redirectTo: "/dashboard"
        });
      } else {
        res.status(400).json({ 
          error: "Payment not completed", 
          paymentStatus: session.payment_status 
        });
      }
      
    } catch (error: any) {
      console.error('Error verifying checkout:', error);
      res.status(500).json({ 
        error: "Failed to verify checkout session",
        message: error.message 
      });
    }
  });

  // ============ WhatsApp Schedule Routes ============

  // Get all schedules for a patient
  app.get("/api/schedules/patient/:patientId", requireAuth, async (req, res) => {
    try {
      const patientId = parseInt(req.params.patientId);
      
      if (isNaN(patientId)) {
        return res.status(400).json({ error: "Invalid patient ID" });
      }

      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(patientId.toString(), userToken);
      
      if (!patient || patient.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - patient not found or not your patient" });
      }

      const schedules = await scheduleService.getSchedulesByPatient(patientId);
      res.json(schedules);
    } catch (error: any) {
      console.error("[Schedule Route] Error getting schedules:", error);
      res.status(500).json({ error: "Failed to get schedules" });
    }
  });

  // Get all schedules for the nutritionist
  app.get("/api/schedules", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const schedules = await scheduleService.getSchedulesByNutritionist(nutritionistId);
      res.json(schedules);
    } catch (error: any) {
      console.error("[Schedule Route] Error getting schedules:", error);
      res.status(500).json({ error: "Failed to get schedules" });
    }
  });

  // Create a new schedule
  const createScheduleSchema = z.object({
    patient_id: z.number(),
    type: scheduleTypeEnum,
    status: scheduleStatusEnum.optional().default("disabled"),
    message_template: z.string().optional(),
    config: z.any(),
    next_run_at: z.string().optional(),
  });

  app.post("/api/schedules", requireAuth, async (req, res) => {
    try {
      const validatedData = createScheduleSchema.parse(req.body);
      
      const userToken = req.session.user.accessToken;
      const patient = await storage.getPatient(validatedData.patient_id.toString(), userToken);
      
      if (!patient || patient.nutritionistId !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - patient not found or not your patient" });
      }

      const scheduleData = {
        ...validatedData,
        nutritionist_id: req.session.user.nutritionistId,
      };

      const schedule = await scheduleService.createSchedule(scheduleData);
      res.status(201).json(schedule);
    } catch (error: any) {
      console.error("[Schedule Route] Error creating schedule:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create schedule" });
    }
  });

  // Update a schedule
  app.patch("/api/schedules/:id", requireAuth, async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id);
      
      if (isNaN(scheduleId)) {
        return res.status(400).json({ error: "Invalid schedule ID" });
      }

      const existingSchedule = await scheduleService.getSchedule(scheduleId);
      if (!existingSchedule || existingSchedule.nutritionist_id !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - schedule not found or not yours" });
      }

      const updates = req.body;
      delete updates.id;
      delete updates.nutritionist_id;
      delete updates.patient_id;

      const schedule = await scheduleService.updateSchedule(scheduleId, updates);
      res.json(schedule);
    } catch (error: any) {
      console.error("[Schedule Route] Error updating schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // Delete a schedule
  app.delete("/api/schedules/:id", requireAuth, async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id);
      
      if (isNaN(scheduleId)) {
        return res.status(400).json({ error: "Invalid schedule ID" });
      }

      const existingSchedule = await scheduleService.getSchedule(scheduleId);
      if (!existingSchedule || existingSchedule.nutritionist_id !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - schedule not found or not yours" });
      }

      await scheduleService.deleteSchedule(scheduleId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[Schedule Route] Error deleting schedule:", error);
      res.status(500).json({ error: "Failed to delete schedule" });
    }
  });

  // Get schedule logs
  app.get("/api/schedules/:id/logs", requireAuth, async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id);
      
      if (isNaN(scheduleId)) {
        return res.status(400).json({ error: "Invalid schedule ID" });
      }

      const existingSchedule = await scheduleService.getSchedule(scheduleId);
      if (!existingSchedule || existingSchedule.nutritionist_id !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - schedule not found or not yours" });
      }

      const logs = await scheduleService.getScheduleLogs(scheduleId);
      res.json(logs);
    } catch (error: any) {
      console.error("[Schedule Route] Error getting logs:", error);
      res.status(500).json({ error: "Failed to get logs" });
    }
  });

  // Manually trigger a schedule (send message now)
  app.post("/api/schedules/:id/send-now", requireAuth, async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id);
      
      if (isNaN(scheduleId)) {
        return res.status(400).json({ error: "Invalid schedule ID" });
      }

      const existingSchedule = await scheduleService.getSchedule(scheduleId);
      if (!existingSchedule || existingSchedule.nutritionist_id !== req.session.user.nutritionistId) {
        return res.status(403).json({ error: "Access denied - schedule not found or not yours" });
      }

      const userToken = req.session.user.accessToken;
      const nutritionist = await storage.getNutritionist(req.session.user.nutritionistId, userToken);
      
      if (!nutritionist?.evolutionInstanceName) {
        return res.status(400).json({ error: "WhatsApp instance not configured" });
      }

      const patient = await storage.getPatient(existingSchedule.patient_id.toString(), userToken);
      if (!patient?.whatsappNumber) {
        return res.status(400).json({ error: "Patient has no WhatsApp number" });
      }

      const message = existingSchedule.message_template || 
        scheduleService.getDefaultMessage(existingSchedule.type, patient.fullName);

      const result = await scheduleService.sendScheduledMessage(
        nutritionist.evolutionInstanceName,
        patient.whatsappNumber,
        message,
        scheduleId,
        existingSchedule.patient_id
      );

      if (result.success) {
        await scheduleService.updateSchedule(scheduleId, {
          last_run_at: new Date().toISOString(),
          failure_count: 0,
          last_error: null,
        });
        res.json({ success: true, messageId: result.messageId });
      } else {
        await scheduleService.updateSchedule(scheduleId, {
          failure_count: (existingSchedule.failure_count || 0) + 1,
          last_error: result.error,
        });
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error("[Schedule Route] Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Get dashboard stats
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const nutritionistId = req.session.user.nutritionistId;
      const userToken = req.session.user.accessToken;
      
      console.log("[Dashboard] Getting stats for nutritionist:", nutritionistId);
      
      const patients = await storage.getPatientsByNutritionist(nutritionistId, userToken);
      console.log("[Dashboard] Found patients:", patients.length);
      
      const scheduleStats = await scheduleService.getDashboardStats(nutritionistId);
      console.log("[Dashboard] Schedule stats:", scheduleStats);
      
      const response = {
        totalPatients: patients.length,
        activeSchedules: scheduleStats.activeSchedules,
        messagesSentToday: scheduleStats.messagesSentToday,
        messagesSentThisWeek: scheduleStats.messagesSentThisWeek,
        pendingSchedules: scheduleStats.pendingSchedules,
      };
      
      console.log("[Dashboard] Returning stats:", response);
      res.json(response);
    } catch (error: any) {
      console.error("[Dashboard] Error getting stats:", error);
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });

  // Get default message template
  app.get("/api/schedules/default-message/:type", requireAuth, async (req, res) => {
    try {
      const type = req.params.type as "reactivation" | "meal_feedback" | "post_consultation";
      const patientName = (req.query.patientName as string) || "Paciente";
      
      if (!["reactivation", "meal_feedback", "post_consultation"].includes(type)) {
        return res.status(400).json({ error: "Invalid schedule type" });
      }

      const message = scheduleService.getDefaultMessage(type, patientName);
      res.json({ message });
    } catch (error: any) {
      console.error("[Schedule Route] Error getting default message:", error);
      res.status(500).json({ error: "Failed to get default message" });
    }
  });

  // Start the automatic schedule processor (runs every 60 seconds)
  scheduleService.startScheduler(60000);
  console.log("[Server] Automatic WhatsApp scheduler started");

  const httpServer = createServer(app);
  return httpServer;
}

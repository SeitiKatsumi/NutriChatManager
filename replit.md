# Overview

NutriChatBot is a comprehensive platform for nutritionists, providing tools for client management, WhatsApp communication, and AI-powered chatbot services. It enables nutritionist registration, user and WhatsApp instance management, and real-time messaging, all within a modern web application. The platform aims to streamline nutritionist workflows, enhance client interaction through automated WhatsApp responses, and provide AI-driven insights for patient care and meal planning.

# User Preferences

Preferred communication style: Simple, everyday language.

All phone numbers must be stored in Directus with Brazil country code "55" prefix:
- Format in database: `5511983283363` (digits only, including country code)
- Display format in UI: `+55 (11) 98328-3363` (Brazilian mask)
- Automatic normalization: 10-11 digit numbers get "55" prepended before saving

# System Architecture

## Frontend Architecture
The client-side is built with React 18 and TypeScript, using shadcn/ui for consistent design and Wouter for routing. TanStack Query manages server state efficiently. The UI features a dark theme, extensive component library, and Vite for fast development.

## Backend Architecture
The server uses Express.js with TypeScript, implementing a RESTful API with a layered approach. It includes route handlers, a storage abstraction layer, and middleware for logging and error handling.

## Database Design
The system uses PostgreSQL with Drizzle ORM for type-safe operations. Key entities include nutritionists, WhatsApp instances, and messages, with proper foreign key relationships and UUID primary keys.

## Authentication & Session Management
The application is configured for session-based authentication using connect-pg-simple for PostgreSQL-based session storage, with secure cookie handling.

## WhatsApp Integration
The platform uses Baileys (`@whiskeysockets/baileys`) running directly inside the application for WhatsApp communication, replacing the external Evolution API dependency. Each nutritionist connects via QR code scan; the `BaileysService` (`server/baileys-service.ts`) manages one Baileys socket per nutritionist, keyed by their ID. Auth state is persisted to `sessions/{nutritionistId}/` using `useMultiFileAuthState`, surviving server restarts. On server boot, existing sessions are auto-reconnected. Incoming messages emit events via Node EventEmitter for downstream AI agent processing. Groups and broadcast messages are ignored. The original Evolution API file (`server/evolution-api.ts`) is kept for reference but is no longer used.

## AI Consultation & Patient History
The system provides AI-powered consultation analysis using OpenAI, integrated with patient conversation history stored in a dedicated Directus `whatsapp_messages` collection. This collection stores persistent, queryable WhatsApp messages with fields like `patient_id`, `message_body`, and `from_me`. AI capabilities include generating quick insights, answering custom questions, and creating personalized 24-hour meal plans based on patient data and conversation history. The meal plan generator uses GPT-4o-mini to produce structured JSON output for 6 meal periods, considering dietary restrictions and goals.

## Internal AI Agent System
Replaces N8N workflow with an in-app AI agent system for handling incoming WhatsApp messages.

**Architecture:**
- `server/whatsapp-message-handler.ts`: Central message dispatcher that receives Evolution API webhooks, identifies patients, routes to correct AI agent, and sends responses back via Evolution API
- `server/openai-service.ts`: Contains `runAnamnesisAgent`, `extractPatientData`, `runFollowUpAgent`, and `analyzeFood` methods

**AI Agents:**
- **Anamnesis Agent**: Collects initial patient data through a multi-step conversational flow. Asks one question at a time, covers personal info, health history, dietary habits, lifestyle, and 24h food recall. When complete, triggers data extraction.
- **Follow-up Agent**: Serves patients in "Acompanhamento" stage with personalized nutritional support using their Directus profile data.
- **Food Image Analysis**: Uses OpenAI Vision (gpt-4o-mini) to analyze food photos and return calorie/macro estimates in Portuguese.

**Flow:**
1. Incoming message arrives at `POST /api/whatsapp/ai-webhook` from Evolution API
2. Handler identifies nutritionist by instance name, looks up or auto-creates patient by WhatsApp number
3. Saves incoming message to `whatsapp_messages` collection
4. Routes to anamnesis agent (if `Etapas` = "Anamnese Inicial") or follow-up agent (if "Acompanhamento")
5. For images, routes directly to food analysis
6. Saves AI response to `whatsapp_messages` and sends via Evolution API
7. When anamnesis completes, extracts structured data and updates all patient fields in Directus, sets `Etapas` to "Acompanhamento"

**Storage Methods Added:**
- `getPatientByWhatsapp(whatsappNumber, nutritionistId)`: Finds patient by WhatsApp number with format variant search
- `getNutritionistByInstanceName(instanceName)`: Finds nutritionist by Evolution instance name

**Conversation Memory:** Fetches last 30 messages from `whatsapp_messages` for context building.

**AI Analysis Caching:**
- Two fields in `Cadastro_de_Pacientes` collection: `ultima_analise_ia` (JSON) and `data_ultima_analise` (timestamp)
- Backend checks cache validity (24-hour TTL) before calling OpenAI
- Frontend uses 30-minute staleTime for TanStack Query
- Manual refresh button available to force regeneration with `?forceRefresh=true` parameter
- Cache indicator shows age in minutes when using cached analysis
- Reduces OpenAI API calls by ~95% for repeated patient card views

## Stripe Payment Integration
The system handles Stripe webhooks with a robust dual-strategy for user lookup, addressing Directus API cache delays by falling back to email-based user search if `stripe_customer_id` is not immediately available. Timestamp conversions for webhook processing use a safe helper function to prevent "Invalid time value" errors. The frontend includes a manual refresh system for subscription status to account for Directus cache delays.

## State Management
Client-side state is managed using TanStack Query for server state and React hooks for local component state. An `AuthContext` manages user authentication and data, supporting manual refresh.

## User Registration Flow
Nutritionist registration is a 3-step form covering basic information, professional details (including clinic WhatsApp), and AI bot configuration (WhatsApp number for bot, welcome message, working hours). All data is saved to Directus `directus_users` collection with the nutritionist role.

## Settings & Profile Management
The Settings page (`/settings`) allows nutritionists to edit their profile information and customize AI agent behavior through two main sections:

**Personal Information:**
- Full name, email (read-only), CPF/CNPJ
- **Three distinct phone numbers:**
  - **Telefone:** Personal/secretary contact number
  - **WhatsApp da Clínica:** Clinic commercial WhatsApp
  - **WhatsApp do Bot IA:** Number used by the Evolution API bot for automated responses
- Address and specialization

**AI Agent Configuration:**
- Agent name and initial greeting message customization

**WhatsApp Bot Number Synchronization:**
- The bot WhatsApp number is stored in TWO Directus fields for consistency:
  - `Whatsapp_IA`: Primary bot number field
  - `whatsapp_number`: Legacy field (kept in sync)
- Backend `transformUserToDirectus` ensures both fields update simultaneously
- Frontend displays with fallback: shows `whatsappIA` first, falls back to `whatsappNumber` for existing users
- Visual warning alerts users that changing the bot number may impact WhatsApp operations
- All phone numbers stored with Brazilian country code prefix (55) as clean digits

## WhatsApp Schedule System
The platform includes automated WhatsApp message scheduling with three dispatch types:

**Schedule Types:**
- **Reactivation**: Single reminder for inactive patients
- **Meal Feedback**: Recurring feedback requests at 7 or 15 day intervals
- **Post-Consultation**: Follow-up after consultations

**Directus Collections:**
- `whatsapp_schedules`: Stores schedule configurations (type, status, message_template, config, next_run_at, failure tracking)
- `whatsapp_schedule_logs`: Audit log for sent messages (schedule_id, patient_id, sent_at, status, error)

**Technical Implementation:**
- `ScheduleService` in `server/schedule-service.ts` handles CRUD operations via Directus API
- Auto-creates collections if missing on first use
- **Directus UUID Filter Workaround**: Due to Directus filter issues with UUID strings, `getSchedulesByNutritionist` fetches all schedules and filters in code (O(n) - pagination recommended for scale)
- Frontend uses `PatientSchedules` component with toggle, edit, and send-now actions
- All schedules disabled by default, activated per patient by nutritionist

**API Endpoints:**
- `GET /api/schedules` - Get all schedules for authenticated nutritionist
- `GET /api/schedules/patient/:patientId` - Get schedules for specific patient
- `POST /api/schedules` - Create new schedule
- `PATCH /api/schedules/:id` - Update schedule (toggle status, edit config)
- `POST /api/schedules/:id/send` - Trigger immediate send

## Patient Data Management
The system properly handles patient information with separated fields for dietary data:

**Field Separation:**
- **`Restricoes_alimentares`** (Directus) → `dietaryRestrictions` (app): Stores dietary restrictions only
- **`Suplementos_e_medicamentos`** (Directus) → `suplementos_medicamentos` (app): Stores supplements and medications only
- Fields are completely independent, preventing data duplication in the UI

**Data Mapping Strategy:**
- **Read (Directus → App):** Each field maps directly without fallbacks
- **Write (App → Directus):** Preserves legacy data when `suplementos_medicamentos` is undefined
- **Auto-Field Creation:** `ensureRequiredFields` creates `Restricoes_alimentares` if missing at startup

**Patient Card Display:**
- Mobile patient cards show WhatsApp number with dedicated icon and test ID
- Contact information displayed in order: WhatsApp, Phone, Email
- All fields properly formatted and responsive

# External Dependencies

## Core Frameworks
- **React 18**: Frontend framework
- **Express.js**: Backend web framework
- **TypeScript**: Type safety
- **Vite**: Build tool

## Database & ORM
- **PostgreSQL**: Primary database (via Neon)
- **Drizzle ORM**: Type-safe database toolkit
- **connect-pg-simple**: PostgreSQL session store

## UI/UX & Styling
- **shadcn/ui**: React component library
- **Radix UI**: Unstyled UI primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library

## State Management & Validation
- **TanStack Query**: Server state management
- **React Hook Form**: Form management
- **Zod**: Schema validation

## External Service Integrations
- **Evolution API**: WhatsApp Business API
- **Directus CMS**: Content management system
- **Neon Database**: Serverless PostgreSQL hosting
- **Stripe**: Payment processing
- **OpenAI**: AI services (for consultation and meal plans)
- **N8N**: Workflow automation (for webhook processing)

## Development Tools
- **ESBuild**: JavaScript bundler
- **PostCSS**: CSS processing
- **tsx**: TypeScript execution
- **Wouter**: Lightweight client-side routing

## Utility Libraries
- **date-fns**: Date manipulation
- **clsx**: Conditional CSS classes
- **nanoid**: Unique ID generation
- **class-variance-authority**: Component variant management
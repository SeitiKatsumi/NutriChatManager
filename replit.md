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
The platform integrates with Evolution API for WhatsApp communication, enabling instance creation, QR code generation for device connection, and message routing. Each nutritionist can configure their own WhatsApp instance with customizable bot settings. New instances are automatically configured with N8N webhooks for `MESSAGES_UPSERT` events, ensuring real-time message processing and AI integration.

## AI Consultation & Patient History
The system provides AI-powered consultation analysis using OpenAI, integrated with patient conversation history stored in a dedicated Directus `whatsapp_messages` collection. This collection stores persistent, queryable WhatsApp messages with fields like `patient_id`, `message_body`, and `from_me`. AI capabilities include generating quick insights, answering custom questions, and creating personalized 24-hour meal plans based on patient data and conversation history. The meal plan generator uses GPT-4o-mini to produce structured JSON output for 6 meal periods, considering dietary restrictions and goals.

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
# Overview

NutriChatBot is a comprehensive management platform for nutritionists that integrates WhatsApp communication through an AI-powered chatbot system. The application provides a full-stack solution for nutritionist registration, user management, and WhatsApp instance management with real-time messaging capabilities. Built as a modern web application, it features a React-based frontend with shadcn/ui components and an Express.js backend with PostgreSQL database integration via Drizzle ORM.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The client-side is built with React 18 and TypeScript, utilizing a component-based architecture with shadcn/ui for consistent design patterns. The application uses Wouter for lightweight client-side routing and TanStack Query for efficient server state management. The UI follows a dark theme design system with comprehensive component library including forms, tables, dialogs, and navigation elements. Vite serves as the build tool providing fast development experience with hot module replacement.

## Backend Architecture
The server runs on Express.js with TypeScript, implementing a RESTful API architecture. The application follows a layered approach with separate route handlers, storage abstraction layer, and middleware for logging and error handling. The storage layer uses an interface-based design allowing for flexible implementation switching between in-memory storage for development and database persistence for production.

## Database Design
The system uses PostgreSQL with Drizzle ORM for type-safe database operations. The schema includes three main entities: nutritionists (user profiles with professional credentials), whatsapp_instances (WhatsApp connection configurations), and messages (communication logs). The database implements proper foreign key relationships and uses UUID primary keys with automatic timestamp tracking.

## Authentication & Session Management
The application is configured with connect-pg-simple for PostgreSQL-based session storage, though the current implementation appears to use in-memory storage during development. The system is prepared for proper session-based authentication with secure cookie handling.

## WhatsApp Integration
The platform integrates with Evolution API for WhatsApp communication management. This enables creating WhatsApp instances, generating QR codes for device connection, and handling message routing. Each nutritionist can have their own WhatsApp instance with customizable bot configurations including agent names, auto-response settings, and welcome messages.

### Automatic Webhook Configuration
All new WhatsApp instances are automatically configured with N8N webhook integration:
- **Webhook URL**: https://n8n.apps.dna11.com.br/webhook/NutriChatbot02
- **Events**: MESSAGES_UPSERT (for real-time message processing)
- **Base64 Enabled**: Automatic conversion of media files to Base64 format
- **Event Filtering**: Enabled for efficient webhook processing

This automatic configuration ensures seamless integration between WhatsApp conversations and the N8N automation workflows, enabling real-time message processing and AI-powered responses without manual webhook setup.

## Stripe Payment Integration

### Webhook Processing with Directus Cache Solution
The system implements a robust dual-strategy approach to handle Stripe webhooks, solving Directus API cache delays:

**Problem**: Directus has a delay between write and read operations. When a user completes payment, the `stripe_customer_id` is saved but may not be immediately available via API queries due to caching.

**Solution**: Two-tier user lookup strategy in `updateSubscriptionFromWebhook`:
1. **Primary Strategy**: Attempts to find user by `stripe_customer_id` (fastest when cache is current)
2. **Fallback Strategy**: If not found, retrieves customer email from Stripe API and searches user by email
   - Email already exists in Directus (no cache delay)
   - Once found, automatically updates `stripe_customer_id` for future webhooks
   - Ensures webhook processing succeeds even during cache delays

This approach guarantees reliable webhook processing while maintaining optimal performance when the cache is current.

### Webhook Date Validation Fix
To prevent "Invalid time value" errors when processing webhooks (especially `customer.subscription.created` before payment), all timestamp conversions now use a safe helper function:

**`safeTimestampToDate()`** - Validates timestamps before conversion:
- Returns valid Date if timestamp exists
- Returns default date (2099-12-31) if timestamp is null/undefined/invalid
- Prevents webhook failures from missing subscription dates

**Critical for:** Events fired before payment completion where `current_period_start/end` may be null.

### Frontend Cache and Real-time Updates
To handle Directus API cache delays and ensure users see updated subscription status promptly:

**Auto-refresh System** in Subscription Management Page:
- **Automatic polling**: When subscription status is "pendente", the page checks for updates every 10 seconds
- **Manual refresh**: "Atualizar Status" button allows users to force an immediate update
- **Auto-stop**: Polling automatically stops once status changes to "ativo"
- **User feedback**: Clear messaging explains that validation can take up to 10 minutes

This solves the cache synchronization issue where Directus updates from Stripe webhooks may not be immediately visible through API queries.

## State Management
Client-side state is managed through TanStack Query for server state and React hooks for local component state. The query client is configured with custom fetch functions that handle authentication and error responses uniformly across the application. The authentication context (AuthContext) manages user and nutritionist data with support for manual refresh via the `checkAuth()` method, which is utilized by the auto-refresh system in subscription management.

## Development Tools
The project uses modern development tooling including TypeScript for type safety, ESLint for code quality, Tailwind CSS for styling, and PostCSS for CSS processing. The build process supports both development and production environments with proper asset optimization.

# Deployment Configuration

## Required Environment Variables for Production

### Stripe Payment Integration
- **STRIPE_SECRET_KEY**: Stripe secret key for backend (starts with `sk_live_` or `sk_test_`)
- **VITE_STRIPE_PUBLIC_KEY**: Stripe publishable key for frontend (starts with `pk_live_` or `pk_test_`)

### Evolution API (WhatsApp Integration)  
- **EVOLUTION_API_KEY**: API key for Evolution WhatsApp service
- **EVOLUTION_API_URL**: Base URL for Evolution API (e.g., `https://api.evolution.com`)

### Database Configuration
- **DATABASE_URL**: PostgreSQL connection string (automatically provided by Replit/Neon)

### Directus CMS Integration
- **DIRECTUS_TOKEN**: Admin token for Directus CMS integration

### Optional Redis Configuration
- **REDIS_HOST**: Redis server hostname (if using external Redis)
- **REDIS_PASSWORD**: Redis authentication password  
- **REDIS_PORT**: Redis server port
- **REDIS_URL**: Complete Redis connection URL

## Deployment Steps

1. **Configure Environment Variables in Replit Deploy:**
   - Go to your Replit workspace
   - Click "Publish" or find "Deployments" in command palette
   - Select your deployment type (Autoscale/Reserved VM)
   - Navigate to "Deployment secrets" section
   - Add all required environment variables listed above

2. **Verify Configuration:**
   - Ensure `STRIPE_SECRET_KEY` and `VITE_STRIPE_PUBLIC_KEY` match (test/live environment)
   - Test Evolution API connectivity with provided credentials
   - Confirm Directus token has admin permissions

3. **Common Issues:**
   - **"Instância não configurada"**: Missing `EVOLUTION_API_KEY` or `EVOLUTION_API_URL`
   - **Stripe not redirecting**: Missing `VITE_STRIPE_PUBLIC_KEY` in frontend
   - **Payment failures**: Mismatched Stripe keys (test vs live environment)

# External Dependencies

## Core Framework Dependencies
- **React 18** - Frontend framework with hooks and modern patterns
- **Express.js** - Backend web framework for Node.js
- **TypeScript** - Type safety across frontend and backend
- **Vite** - Build tool and development server

## Database & ORM
- **PostgreSQL** - Primary database (configured via Neon serverless)
- **Drizzle ORM** - Type-safe database toolkit with schema migrations
- **connect-pg-simple** - PostgreSQL session store for Express

## UI Component Library
- **shadcn/ui** - Comprehensive React component library built on Radix UI
- **Radix UI** - Unstyled, accessible UI primitives
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library for consistent iconography

## State Management & Data Fetching
- **TanStack Query** - Server state management and caching
- **React Hook Form** - Form state management with validation
- **Zod** - Schema validation for type-safe data handling

## External Service Integrations
- **Evolution API** - WhatsApp Business API integration for bot management
- **Directus CMS** - Content management system integration (configured but not actively used)
- **Neon Database** - Serverless PostgreSQL hosting

## Development & Build Tools
- **ESBuild** - Fast JavaScript bundler for production builds
- **PostCSS** - CSS processing with autoprefixer
- **tsx** - TypeScript execution engine for development
- **Wouter** - Lightweight client-side routing

## Utility Libraries
- **date-fns** - Date manipulation and formatting
- **clsx** - Conditional CSS class composition
- **nanoid** - Unique ID generation
- **class-variance-authority** - Component variant management
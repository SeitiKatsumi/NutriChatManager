# Overview

NutriChatBot is a platform for nutritionists to manage patients, communicate through WhatsApp, and run AI-powered nutrition workflows. WhatsApp now uses one global official Twilio sender for all nutritionists.

# User Preferences

Preferred communication style: Simple, everyday language.

All phone numbers must be stored in Directus with Brazil country code "55" prefix:
- Format in database: `5511983283363` (digits only, including country code)
- Display format in UI: `+55 (11) 98328-3363` (Brazilian mask)
- Automatic normalization: 10-11 digit numbers get "55" prepended before saving

# System Architecture

## Frontend
React 18, TypeScript, shadcn/ui, Wouter, TanStack Query, Tailwind, and Vite.

## Backend
Express.js and TypeScript with route handlers, storage abstraction, session auth, and Directus integration.

## Database
PostgreSQL is used with Drizzle for local AI config. Directus persists nutritionists, patients, WhatsApp conversation history, and schedule logs.

## Authentication
Session-based authentication uses `connect-pg-simple` and secure cookies.

## WhatsApp Integration
The platform uses Twilio's official WhatsApp API. A single global Twilio WhatsApp sender receives inbound webhooks and sends AI/scheduled responses. QR code sessions and per-nutritionist WhatsApp instances are deprecated.

## Internal AI Agent System
Incoming Twilio webhook messages are matched to patients by WhatsApp number, saved to Directus `whatsapp_messages`, routed to the in-app AI agents, and answered through Twilio.

Key components:
- `server/twilio-whatsapp-service.ts`: validates Twilio webhooks, parses inbound payloads, downloads media, and sends WhatsApp messages.
- `server/whatsapp-message-handler.ts`: identifies patients, routes to AI agents, saves history, and sends responses.
- `server/openai-service.ts`: runs anamnesis, follow-up, extraction, and food image analysis.

AI agents:
- Anamnesis Agent: collects initial patient information one question at a time.
- Follow-up Agent: supports patients in the `Acompanhamento` stage using their Directus profile.
- Food Image Analysis: estimates calories and macros from food photos.

Conversation memory uses Directus `whatsapp_messages` plus an in-memory short-term cache. Per-patient locking serializes message processing.

## Admin AI Configuration Panel
The admin panel at `/admin` manages AI prompts, models, max tokens, and temperature through `server/ai-config-store.ts`. OpenAI service methods read these configs at runtime.

## Stripe Payment Integration
Stripe webhooks update subscription state with Directus-backed user lookup. Frontend includes subscription refresh paths.

## Settings & Profile Management
The `/settings` page lets nutritionists update personal/profile data and customize AI agent behavior. The bot WhatsApp sender is global and configured through Twilio environment variables.

## WhatsApp Schedule System
Scheduled WhatsApp messages support reactivation, meal feedback, and post-consultation dispatch. `ScheduleService` sends through Twilio and logs results in Directus.

# External Dependencies

Core: React, Express, TypeScript, Vite, PostgreSQL, Drizzle, Directus, Stripe, OpenAI, Twilio, TanStack Query, Zod, shadcn/ui, Tailwind, date-fns.

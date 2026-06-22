import type { Request } from "express";
import twilio from "twilio";

type MessageType = "text" | "image" | "audio" | "video" | "document";

export interface TwilioInboundMedia {
  url: string;
  contentType: string;
}

export interface TwilioInboundWhatsAppMessage {
  messageSid: string;
  fromNumber: string;
  toNumber: string;
  body: string;
  messageType: MessageType;
  media: TwilioInboundMedia[];
}

export interface TwilioSendOptions {
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

function normalizeWhatsAppAddress(value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/\D/g, "")}`;
  return `whatsapp:${withPlus}`;
}

function cleanWhatsAppNumber(value: string): string {
  return value.replace("whatsapp:", "").replace(/\D/g, "");
}

function inferMessageType(contentType: string | undefined): MessageType {
  if (!contentType) return "text";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  return "document";
}

export class TwilioWhatsAppService {
  private get accountSid() {
    return process.env.TWILIO_ACCOUNT_SID || "";
  }

  private get authToken() {
    return process.env.TWILIO_AUTH_TOKEN || "";
  }

  private get sender() {
    return normalizeWhatsAppAddress(
      process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_SENDER
    );
  }

  private get messagingServiceSid() {
    return process.env.TWILIO_MESSAGING_SERVICE_SID || "";
  }

  private get statusCallbackUrl() {
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
    return baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/twilio/whatsapp/status` : "";
  }

  isConfigured(): boolean {
    return !!(this.accountSid && this.authToken && (this.sender || this.messagingServiceSid));
  }

  getStatus() {
    const configured = this.isConfigured();
    return {
      status: configured ? "open" : "not_configured",
      instance: {
        state: configured ? "open" : "not_configured",
        instanceName: "twilio-global-whatsapp",
      },
      provider: "twilio",
      sender: this.sender || null,
      messagingServiceSid: this.messagingServiceSid || null,
      requiresQrCode: false,
    };
  }

  private get client() {
    if (!this.accountSid || !this.authToken) {
      throw new Error("Twilio credentials are not configured");
    }
    return twilio(this.accountSid, this.authToken);
  }

  private getRequestUrl(req: Request): string {
    const configuredBaseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
    if (configuredBaseUrl) {
      return `${configuredBaseUrl.replace(/\/$/, "")}${req.originalUrl}`;
    }

    const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
    const protocol = forwardedProto || req.protocol;
    const host = forwardedHost || req.get("host");
    return `${protocol}://${host}${req.originalUrl}`;
  }

  validateWebhook(req: Request): boolean {
    const shouldValidate =
      process.env.TWILIO_VALIDATE_WEBHOOK_SIGNATURE === "true" ||
      (process.env.NODE_ENV === "production" && process.env.TWILIO_VALIDATE_WEBHOOK_SIGNATURE !== "false");

    if (!shouldValidate) return true;
    if (!this.authToken) return false;

    const signature = req.get("x-twilio-signature");
    if (!signature) return false;

    return twilio.validateRequest(
      this.authToken,
      signature,
      this.getRequestUrl(req),
      req.body as Record<string, string>
    );
  }

  parseInboundMessage(body: Record<string, any>): TwilioInboundWhatsAppMessage {
    const mediaCount = Number(body.NumMedia || 0);
    const media: TwilioInboundMedia[] = [];

    for (let index = 0; index < mediaCount; index++) {
      const url = body[`MediaUrl${index}`];
      const contentType = body[`MediaContentType${index}`] || "";
      if (url) media.push({ url, contentType });
    }

    const firstMediaType = media[0]?.contentType;

    return {
      messageSid: String(body.MessageSid || body.SmsMessageSid || ""),
      fromNumber: cleanWhatsAppNumber(String(body.From || "")),
      toNumber: cleanWhatsAppNumber(String(body.To || "")),
      body: String(body.Body || ""),
      messageType: media.length > 0 ? inferMessageType(firstMediaType) : "text",
      media,
    };
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    if (!this.accountSid || !this.authToken) {
      throw new Error("Twilio credentials are not configured");
    }

    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download Twilio media (${response.status})`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async sendWhatsAppText(to: string, text: string, options: TwilioSendOptions = {}) {
    if (!this.isConfigured()) {
      throw new Error("Twilio WhatsApp is not configured");
    }

    const messagePayload: any = {
      to: normalizeWhatsAppAddress(to),
    };

    if (this.statusCallbackUrl) {
      messagePayload.statusCallback = this.statusCallbackUrl;
    }

    if (this.messagingServiceSid && !this.sender) {
      messagePayload.messagingServiceSid = this.messagingServiceSid;
    } else {
      messagePayload.from = this.sender;
    }

    if (options.contentSid) {
      messagePayload.contentSid = options.contentSid;
      messagePayload.contentVariables = JSON.stringify(options.contentVariables || {});
    } else {
      messagePayload.body = text;
    }

    const result = await this.client.messages.create(messagePayload);

    return {
      sid: result.sid,
      status: result.status,
    };
  }

  async sendScheduledWhatsAppText(to: string, text: string) {
    const contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_CONTENT_SID;
    const useTemplate = process.env.TWILIO_USE_CONTENT_TEMPLATES === "true" && !!contentSid;

    if (useTemplate) {
      return this.sendWhatsAppText(to, text, {
        contentSid,
        contentVariables: { "1": text },
      });
    }

    return this.sendWhatsAppText(to, text);
  }
}

export const twilioWhatsAppService = new TwilioWhatsAppService();

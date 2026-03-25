import baileysPkg, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidGroup,
  isJidBroadcast,
  isJidStatusBroadcast,
  isJidUser,
  isLidUser,
  isJidNewsletter,
  jidDecode,
  jidNormalizedUser,
  makeWASocket as namedMakeWASocket,
  type WASocket,
  type ConnectionState,
} from "@whiskeysockets/baileys";

const makeWASocket = namedMakeWASocket || (baileysPkg as any).default || baileysPkg;
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
import * as QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs";

const logger = pino({ level: "warn" });

interface BaileysSession {
  socket: WASocket | null;
  qrCode: string | null;
  status: "disconnected" | "connecting" | "connected" | "qr";
  nutritionistId: string;
  whatsappNumber: string;
  retryCount: number;
  conflictCount: number;
  lastConflictAt: number;
}

export class BaileysService extends EventEmitter {
  private sessions: Map<string, BaileysSession> = new Map();
  private sessionsDir: string;
  private reconnecting: Set<string> = new Set();

  constructor() {
    super();
    this.sessionsDir = path.resolve(process.cwd(), "sessions");
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private static sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9\-_]/g, "");
  }

  private getSessionDir(nutritionistId: string): string {
    const safeId = BaileysService.sanitizeId(nutritionistId);
    return path.join(this.sessionsDir, safeId);
  }

  async startSession(nutritionistId: string, whatsappNumber: string): Promise<void> {
    const existing = this.sessions.get(nutritionistId);
    if (existing && (existing.status === "connected" || existing.status === "connecting" || existing.status === "qr")) {
      console.log(`[Baileys] Session already ${existing.status} for ${nutritionistId}`);
      return;
    }

    const sessionDir = this.getSessionDir(nutritionistId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const session: BaileysSession = {
      socket: null,
      qrCode: null,
      status: "connecting",
      nutritionistId,
      whatsappNumber,
      retryCount: 0,
      conflictCount: 0,
      lastConflictAt: 0,
    };
    this.sessions.set(nutritionistId, session);

    await this.connectSocket(nutritionistId, sessionDir);
  }

  private async connectSocket(nutritionistId: string, sessionDir: string): Promise<void> {
    const session = this.sessions.get(nutritionistId);
    if (!session) return;

    if (this.reconnecting.has(nutritionistId)) {
      console.log(`[Baileys] Already reconnecting ${nutritionistId}, skipping`);
      return;
    }
    this.reconnecting.add(nutritionistId);

    try {
      if (session.socket) {
        try {
          session.socket.ev.removeAllListeners("connection.update");
          session.socket.ev.removeAllListeners("creds.update");
          session.socket.ev.removeAllListeners("messages.upsert");
          session.socket.end(undefined);
        } catch (e) {
        }
        session.socket = null;
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      });

      session.socket = socket;
      this.reconnecting.delete(nutritionistId);

      socket.ev.on("creds.update", saveCreds);

      socket.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
            session.qrCode = qrBase64;
            session.status = "qr";
            console.log(`[Baileys] QR code generated for ${nutritionistId}`);
          } catch (err) {
            console.error(`[Baileys] Error generating QR code for ${nutritionistId}:`, err);
          }
        }

        if (connection === "close") {
          const error = lastDisconnect?.error;
          const statusCode = error instanceof Boom ? error.output.statusCode : undefined;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          const isConflict = statusCode === 440 || statusCode === DisconnectReason.connectionReplaced;

          console.log(
            `[Baileys] Connection closed for ${nutritionistId}. Status code: ${statusCode}. Reconnect: ${shouldReconnect}. Conflict: ${isConflict}`
          );

          if (statusCode === DisconnectReason.loggedOut) {
            session.status = "disconnected";
            session.qrCode = null;
            console.log(`[Baileys] Session logged out for ${nutritionistId}. Clearing auth state.`);
            try {
              fs.rmSync(sessionDir, { recursive: true, force: true });
              fs.mkdirSync(sessionDir, { recursive: true });
            } catch (e) {
              console.error(`[Baileys] Error clearing session dir:`, e);
            }
            this.sessions.delete(nutritionistId);
            this.reconnecting.delete(nutritionistId);
          } else if (isConflict) {
            const now = Date.now();
            if (now - session.lastConflictAt < 30000) {
              session.conflictCount++;
            } else {
              session.conflictCount = 1;
            }
            session.lastConflictAt = now;

            if (session.conflictCount >= 3) {
              console.log(`[Baileys] Repeated conflict for ${nutritionistId} (${session.conflictCount} times). Another instance is active. Backing off for 60s.`);
              session.status = "connecting";
              session.qrCode = null;
              setTimeout(() => {
                session.conflictCount = 0;
                this.reconnecting.delete(nutritionistId);
                this.connectSocket(nutritionistId, sessionDir);
              }, 60000);
            } else {
              const delay = session.conflictCount * 5000;
              console.log(`[Baileys] Conflict detected for ${nutritionistId}. Reconnecting in ${delay}ms (conflict ${session.conflictCount})`);
              session.status = "connecting";
              session.qrCode = null;
              setTimeout(() => {
                this.reconnecting.delete(nutritionistId);
                this.connectSocket(nutritionistId, sessionDir);
              }, delay);
            }
          } else if (shouldReconnect && session.retryCount < 5) {
            session.retryCount++;
            const delay = Math.min(session.retryCount * 2000, 30000);
            console.log(
              `[Baileys] Will reconnect ${nutritionistId} in ${delay}ms (attempt ${session.retryCount})`
            );
            session.status = "connecting";
            session.qrCode = null;
            setTimeout(() => {
              this.reconnecting.delete(nutritionistId);
              this.connectSocket(nutritionistId, sessionDir);
            }, delay);
          } else {
            console.log(`[Baileys] Max retries reached for ${nutritionistId}. Stopping.`);
            session.status = "disconnected";
            session.qrCode = null;
            this.reconnecting.delete(nutritionistId);
          }
        }

        if (connection === "open") {
          session.status = "connected";
          session.qrCode = null;
          session.retryCount = 0;
          this.reconnecting.delete(nutritionistId);
          console.log(`[Baileys] Connected for ${nutritionistId}`);
        }
      });

      socket.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
          if (!msg.message) continue;
          if (msg.key.fromMe) continue;

          const jid = msg.key.remoteJid;
          if (!jid) continue;

          if (isJidGroup(jid) || isJidBroadcast(jid) || isJidStatusBroadcast(jid)) {
            continue;
          }

          if (isLidUser(jid)) {
            console.log(`[Baileys] Ignoring LID message from ${jid} (linked device ID, not a phone number)`);
            continue;
          }

          if (isJidNewsletter(jid)) {
            console.log(`[Baileys] Ignoring newsletter message from ${jid}`);
            continue;
          }

          if (!isJidUser(jid)) {
            console.log(`[Baileys] Ignoring message from unknown JID type: ${jid}`);
            continue;
          }

          const decoded = jidDecode(jid);
          if (!decoded || !decoded.user) {
            console.log(`[Baileys] Could not decode JID: ${jid}`);
            continue;
          }

          const phoneNumber = decoded.user;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            "";

          this.emit("message", {
            nutritionistId,
            from: phoneNumber,
            text,
            message: msg,
            timestamp: msg.messageTimestamp,
          });
        }
      });
    } catch (error) {
      console.error(`[Baileys] Error starting session for ${nutritionistId}:`, error);
      session.status = "disconnected";
      this.reconnecting.delete(nutritionistId);
    }
  }

  getQRCode(nutritionistId: string): string | null {
    const session = this.sessions.get(nutritionistId);
    return session?.qrCode || null;
  }

  getStatus(nutritionistId: string): {
    status: string;
    instance: { state: string; instanceName: string };
  } {
    const session = this.sessions.get(nutritionistId);
    const state = session?.status || "disconnected";

    let mappedState: string;
    if (state === "connected") {
      mappedState = "open";
    } else if (state === "qr") {
      mappedState = "qr";
    } else if (state === "connecting" && this.reconnecting.has(nutritionistId)) {
      mappedState = "connecting";
    } else {
      mappedState = "close";
    }

    return {
      status: mappedState,
      instance: {
        state: mappedState,
        instanceName: `nutri_${nutritionistId}`,
      },
    };
  }

  async sendMessage(
    nutritionistId: string,
    to: string,
    text: string
  ): Promise<{ key: { remoteJid: string; fromMe: boolean; id: string }; status: string }> {
    const session = this.sessions.get(nutritionistId);
    if (!session || !session.socket || session.status !== "connected") {
      throw new Error(`WhatsApp session not connected for nutritionist ${nutritionistId}`);
    }

    const cleanedNumber = BaileysService.cleanWhatsAppNumber(to);
    const jid = `${cleanedNumber}@s.whatsapp.net`;

    console.log(`[Baileys] Sending message to ${cleanedNumber} for nutritionist ${nutritionistId}`);

    const result = await session.socket.sendMessage(jid, { text });

    return {
      key: {
        remoteJid: jid,
        fromMe: true,
        id: result?.key?.id || "",
      },
      status: "sent",
    };
  }

  async sendImageAnalysisResult(
    nutritionistId: string,
    to: string,
    analysisText: string
  ): Promise<{ key: { remoteJid: string; fromMe: boolean; id: string }; status: string }> {
    return this.sendMessage(nutritionistId, to, analysisText);
  }

  async sendTextByInstanceName(
    instanceName: string,
    to: string,
    text: string
  ): Promise<{ key: { remoteJid: string; fromMe: boolean; id: string }; status: string }> {
    const nutritionistId = this.findNutritionistByInstanceName(instanceName);
    if (!nutritionistId) {
      throw new Error(`No session found for instance ${instanceName}`);
    }
    return this.sendMessage(nutritionistId, to, text);
  }

  private findNutritionistByInstanceName(instanceName: string): string | null {
    const match = instanceName.match(/^nutri_(.+)$/);
    if (match) {
      const id = match[1];
      if (this.sessions.has(id)) {
        return id;
      }
    }
    return null;
  }

  hasExistingSession(nutritionistId: string): boolean {
    const sessionDir = this.getSessionDir(nutritionistId);
    if (!fs.existsSync(sessionDir)) return false;
    const files = fs.readdirSync(sessionDir);
    return files.length > 0;
  }

  async stopSession(nutritionistId: string): Promise<void> {
    const session = this.sessions.get(nutritionistId);
    if (session?.socket) {
      try {
        session.socket.end(undefined);
      } catch (e) {
        console.error(`[Baileys] Error stopping session for ${nutritionistId}:`, e);
      }
    }
    this.sessions.delete(nutritionistId);
  }

  static cleanWhatsAppNumber(whatsappNumber: string): string {
    const cleaned = whatsappNumber.replace(/\D/g, "");
    if (cleaned.length === 10 || cleaned.length === 11) {
      if (!cleaned.startsWith("55")) {
        return "55" + cleaned;
      }
    }
    return cleaned;
  }

  async autoStartSessions(
    getNutritionists: () => Promise<Array<{ id: string; whatsappIA?: string; evolutionInstanceName?: string }>>
  ): Promise<void> {
    console.log("[Baileys] Auto-starting sessions from saved state...");
    try {
      const nutritionists = await getNutritionists();
      let started = 0;

      for (const nutri of nutritionists) {
        const whatsappNumber = nutri.whatsappIA;
        if (!whatsappNumber) continue;

        if (this.hasExistingSession(nutri.id)) {
          console.log(`[Baileys] Restoring session for nutritionist ${nutri.id}`);
          try {
            await this.startSession(nutri.id, whatsappNumber);
            started++;
          } catch (err) {
            console.error(`[Baileys] Failed to restore session for ${nutri.id}:`, err);
          }
        }
      }

      console.log(`[Baileys] Auto-start complete. Restored ${started} sessions.`);
    } catch (error) {
      console.error("[Baileys] Error during auto-start:", error);
    }
  }
}

export const baileysService = new BaileysService();

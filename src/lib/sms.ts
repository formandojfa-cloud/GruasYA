/**
 * Envío del código de verificación de teléfono. El proveedor se elige con
 * `SMS_PROVIDER`:
 *
 * - `console` (default fuera de producción): imprime el código en el log del
 *   servidor. En producción lanza un error de configuración claro.
 * - `twilio`: Twilio Verify v2 por REST (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
 *   `TWILIO_VERIFY_SERVICE_SID`). Twilio genera y comprueba el código.
 * - `whatsapp`: WhatsApp Cloud API con plantilla de autenticación
 *   (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, opcional
 *   `WHATSAPP_TEMPLATE_LANG`, por defecto `es`).
 *
 * El código nunca viaja en la respuesta de la API.
 */
import { isProduction } from "./config";
import { toE164Gt } from "./notifications";

export type SmsProviderName = "console" | "twilio" | "whatsapp";

export type SmsProvider = {
  name: SmsProviderName;
  /** Si es true, el proveedor genera y comprueba el código (Twilio Verify). */
  managesCode: boolean;
  /** Envía `code` (ignorado si `managesCode`). */
  send(phone: string, code: string): Promise<void>;
  /** Solo si `managesCode`: comprueba el código con el proveedor. */
  check?(phone: string, code: string): Promise<boolean>;
};

export class SmsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsConfigError";
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new SmsConfigError(`Falta la variable ${name} para el proveedor de SMS configurado`);
  return v;
}

export function smsProviderName(): SmsProviderName {
  const raw = (process.env.SMS_PROVIDER ?? "console").toLowerCase();
  if (raw === "twilio" || raw === "whatsapp" || raw === "console") return raw;
  throw new SmsConfigError(`SMS_PROVIDER desconocido: ${raw} (usa console, twilio o whatsapp)`);
}

const consoleProvider: SmsProvider = {
  name: "console",
  managesCode: false,
  async send(phone, code) {
    if (isProduction()) {
      throw new SmsConfigError(
        "SMS_PROVIDER=console no sirve en producción: configura twilio o whatsapp (ver .env.example)",
      );
    }
    console.info(`[sms] código de verificación para ${phone}: ${code}`);
  },
};

const twilioProvider: SmsProvider = {
  name: "twilio",
  managesCode: true,
  async send(phone) {
    const sid = env("TWILIO_ACCOUNT_SID");
    const token = env("TWILIO_AUTH_TOKEN");
    const service = env("TWILIO_VERIFY_SERVICE_SID");
    const body = new URLSearchParams({ To: `+${toE164Gt(phone)}`, Channel: "sms", Locale: "es" });
    const r = await fetch(`https://verify.twilio.com/v2/Services/${service}/Verifications`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!r.ok) throw new Error(`Twilio Verify respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  },
  async check(phone, code) {
    const sid = env("TWILIO_ACCOUNT_SID");
    const token = env("TWILIO_AUTH_TOKEN");
    const service = env("TWILIO_VERIFY_SERVICE_SID");
    const body = new URLSearchParams({ To: `+${toE164Gt(phone)}`, Code: code });
    const r = await fetch(`https://verify.twilio.com/v2/Services/${service}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!r.ok) return false;
    const json = (await r.json()) as { status?: string };
    return json.status === "approved";
  },
};

const whatsappProvider: SmsProvider = {
  name: "whatsapp",
  managesCode: false,
  async send(phone, code) {
    const token = env("WHATSAPP_TOKEN");
    const phoneId = env("WHATSAPP_PHONE_ID");
    const template = env("WHATSAPP_TEMPLATE");
    const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "es";
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164Gt(phone),
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    });
    if (!r.ok) throw new Error(`WhatsApp Cloud API respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  },
};

export function getSmsProvider(): SmsProvider {
  switch (smsProviderName()) {
    case "twilio":
      return twilioProvider;
    case "whatsapp":
      return whatsappProvider;
    default:
      return consoleProvider;
  }
}

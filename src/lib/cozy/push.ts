import webpush from "web-push";
import { KassServerError } from "@/lib/kass/errors";

let configured = false;

export function getVapidPublicKey() {
  return process.env.COZY_VAPID_PUBLIC_KEY || "";
}

export function configureWebPush() {
  if (configured) return;

  const publicKey = process.env.COZY_VAPID_PUBLIC_KEY;
  const privateKey = process.env.COZY_VAPID_PRIVATE_KEY;
  const subject = process.env.COZY_VAPID_SUBJECT || "mailto:admin@cozycoffee.local";

  if (!publicKey || !privateKey) {
    throw new KassServerError("validation_error", "Web push VAPID keys are not configured.", 503);
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function assertPushCronAuthorized(request: Request) {
  const secret = process.env.COZY_PUSH_CRON_SECRET;
  if (!secret) return;

  const { searchParams } = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = bearer || searchParams.get("secret");

  if (provided !== secret) {
    throw new KassServerError("validation_error", "Push cron is not authorized.", 401);
  }
}

export { webpush };

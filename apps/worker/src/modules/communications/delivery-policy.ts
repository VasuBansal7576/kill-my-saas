import type { communicationRecipients } from "@programflow/database";

type DeliveryStatus = typeof communicationRecipients.$inferSelect.status;

export const MAX_DELIVERY_ATTEMPTS = 3;

export interface DeliveryRetryAssessment {
  eligible: boolean;
  nextAttempt: number | null;
  remediation: string;
}

export function assessDeliveryProof(input: { status: DeliveryStatus; providerMessageId: string | null }) {
  if (input.status === "delivered") {
    return {
      claim: "delivered" as const,
      delivered: true,
      providerMessageId: input.providerMessageId,
      explanation: "Brevo recorded a delivered outcome for this message.",
    };
  }
  if (input.status === "accepted") {
    return {
      claim: "provider_accepted" as const,
      delivered: false,
      providerMessageId: input.providerMessageId,
      explanation: "Brevo accepted the message for processing; no delivery receipt has been recorded yet.",
    };
  }
  return {
    claim: input.status as Exclude<DeliveryStatus, "accepted" | "delivered">,
    delivered: false,
    providerMessageId: input.providerMessageId,
    explanation: deliveryExplanation(input.status),
  };
}

export function assessDeliveryRetry(input: {
  status: DeliveryStatus;
  attemptCount: number;
  toEmail: string | null;
  lastErrorCode: string | null;
  lastAttemptRetryable?: boolean;
}): DeliveryRetryAssessment {
  if (!input.toEmail) return denied("Add a valid canonical email to the Person record before creating a new communication.");
  if (input.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
    return denied(`Automatic retry limit reached (${MAX_DELIVERY_ATTEMPTS} attempts). Verify the address and provider evidence, then create a new communication if another send is justified.`);
  }
  if (input.status === "delivered") return denied("No retry is needed because Brevo recorded a delivered outcome.");
  if (input.status === "accepted") return denied("Brevo accepted this message. Check delivery outcomes instead of sending a duplicate.");
  if (input.status === "queued" || input.status === "sending") return denied("The delivery is still pending. Wait for the outbox or provider attempt to finish before retrying.");
  if (input.status === "bounced" && input.lastErrorCode === "hardBounce") {
    return denied("Brevo reported a hard bounce. Correct or replace the recipient email before sending a new communication.");
  }
  if (input.status === "failed" && ["invalid", "spam"].includes(input.lastErrorCode ?? "")) {
    return denied("Brevo reported a permanent recipient failure. Correct the recipient address or consent state before creating a new communication.");
  }
  if (input.status === "failed" && input.lastAttemptRetryable === false) {
    return denied("The provider marked the last failure as permanent. Correct the provider or recipient configuration before creating a new communication.");
  }
  if (!["failed", "bounced", "blocked_external"].includes(input.status)) {
    return denied("This delivery state is not eligible for retry.");
  }
  const remediation = input.status === "blocked_external"
    ? "Configure Brevo credentials and a verified sender, then retry this retained delivery."
    : input.status === "bounced"
      ? "Confirm the temporary bounce has cleared, then retry this retained delivery."
      : "Review the provider error and recipient address, then retry this retained delivery.";
  return { eligible: true, nextAttempt: input.attemptCount + 1, remediation };
}

function denied(remediation: string): DeliveryRetryAssessment {
  return { eligible: false, nextAttempt: null, remediation };
}

function deliveryExplanation(status: DeliveryStatus): string {
  return ({
    queued: "The delivery is waiting for outbox dispatch.",
    sending: "A provider request is in progress.",
    accepted: "Brevo accepted the message for processing; no delivery receipt has been recorded yet.",
    delivered: "Brevo recorded a delivered outcome for this message.",
    bounced: "Brevo reported that the recipient did not accept the message.",
    failed: "The delivery failed before a delivered receipt was recorded.",
    blocked_external: "No provider request was made because email delivery is not configured.",
  })[status];
}

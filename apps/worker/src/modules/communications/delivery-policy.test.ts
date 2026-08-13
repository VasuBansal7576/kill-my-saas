import { describe, expect, it } from "vitest";
import { assessDeliveryProof, assessDeliveryRetry, MAX_DELIVERY_ATTEMPTS } from "./delivery-policy";

describe("truthful delivery proof and bounded retries", () => {
  it("does not present provider queue acceptance as delivery", () => {
    expect(assessDeliveryProof({ status: "accepted", providerMessageId: "brevo-message-1" })).toEqual({
      claim: "provider_accepted",
      delivered: false,
      providerMessageId: "brevo-message-1",
      explanation: "Brevo accepted the message for processing; no delivery receipt has been recorded yet.",
    });
    expect(assessDeliveryProof({ status: "delivered", providerMessageId: "brevo-message-1" }).delivered).toBe(true);
  });

  it("allows only eligible failures below the fixed retry cap and always explains remediation", () => {
    expect(assessDeliveryRetry({ status: "failed", attemptCount: 1, toEmail: "speaker@example.com", lastErrorCode: "provider_timeout" })).toMatchObject({
      eligible: true,
      nextAttempt: 2,
    });
    expect(assessDeliveryRetry({ status: "bounced", attemptCount: 1, toEmail: "speaker@example.com", lastErrorCode: "hardBounce" })).toEqual({
      eligible: false,
      nextAttempt: null,
      remediation: "Brevo reported a hard bounce. Correct or replace the recipient email before sending a new communication.",
    });
    expect(assessDeliveryRetry({ status: "failed", attemptCount: MAX_DELIVERY_ATTEMPTS, toEmail: "speaker@example.com", lastErrorCode: "provider_timeout" })).toEqual({
      eligible: false,
      nextAttempt: null,
      remediation: `Automatic retry limit reached (${MAX_DELIVERY_ATTEMPTS} attempts). Verify the address and provider evidence, then create a new communication if another send is justified.`,
    });
    expect(assessDeliveryRetry({ status: "failed", attemptCount: 1, toEmail: "speaker@example.com", lastErrorCode: "invalid_parameter", lastAttemptRetryable: false })).toMatchObject({
      eligible: false,
      remediation: "The provider marked the last failure as permanent. Correct the provider or recipient configuration before creating a new communication.",
    });
  });
});

export interface Env {
  ACCELEVENTS_API_TOKEN?: string;
  AI?: Ai;
  AIRTABLE_TOKEN?: string;
  APP_ENV: "local" | "preview" | "evaluation" | "production";
  ASSETS: Fetcher;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  BREVO_WEBHOOK_TOKEN?: string;
  DATABASE_URL?: string;
  DEPLOYMENT_ID?: string;
  EVALUATION_RESET_RUNBOOK_URL?: string;
  EVALUATION_URL?: string;
  FILES_ACCESS_KEY_ID?: string;
  FILES_BUCKET?: string;
  FILES_ENDPOINT_URL?: string;
  FILES_REGION?: string;
  FILES_SECRET_ACCESS_KEY?: string;
  GIT_COMMIT_SHA?: string;
  JOBS: Queue;
  NEON_AUTH_BASE_URL?: string;
  NEON_AUTH_COOKIE_SECRET?: string;
  RELEASE_MIGRATION?: string;
  SOURCE_URL?: string;
}

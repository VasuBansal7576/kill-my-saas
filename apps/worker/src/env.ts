export interface Env {
  AI?: Ai;
  APP_ENV: "local" | "preview" | "evaluation" | "production";
  ASSETS: Fetcher;
  BREVO_API_KEY?: string;
  DATABASE_URL?: string;
  FILES: R2Bucket;
  GIT_COMMIT_SHA?: string;
  JOBS: Queue;
  NEON_AUTH_BASE_URL?: string;
}

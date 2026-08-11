import { createAuthClient } from "@neondatabase/auth";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim();

export const authClient = authUrl ? createAuthClient(authUrl) : null;


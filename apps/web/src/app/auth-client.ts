import { createAuthClient } from "@neondatabase/auth";

export const authClient = createAuthClient(`${window.location.origin}/api/auth`);

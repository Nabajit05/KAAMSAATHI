/**
 * Public, non-secret configuration that may reach the browser.
 * Supabase's anon/publishable key is designed to be public; RLS protects data.
 */
export const publicConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export const authConfigured = Boolean(publicConfig.supabaseUrl && publicConfig.supabaseAnonKey);

/**
 * Sign-in method. Phone OTP is preferred for workers but needs an SMS
 * provider configured in Supabase; email OTP works on the free tier.
 */
export const authMethod: "phone" | "email" = process.env.NEXT_PUBLIC_AUTH_METHOD === "email" ? "email" : "phone";

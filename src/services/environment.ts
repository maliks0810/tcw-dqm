export type OktaEnvConfig = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  identityFieldInToken?: string;
};

export type AppEnv = { environment: string; okta: OktaEnvConfig };

let cached: AppEnv | null = null;

export async function loadEnv(): Promise<AppEnv> {
  if (cached) return cached;
  const res = await fetch("/environment.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load /environment.json");
  cached = (await res.json()) as AppEnv;
  return cached;
}
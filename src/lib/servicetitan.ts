// ServiceTitan REST client for the Marketing app.
// Same OAuth2 client-credentials auth as the SPIFF Dashboard / Install Planner.
// Adds bulk customer + location address pulls for direct-mail de-duplication.

interface STConfig {
  tenantId: string;
  appKey: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  apiBase: string;
}

function loadConfig(): STConfig {
  const required = [
    "SERVICETITAN_TENANT_ID",
    "SERVICETITAN_APP_KEY",
    "SERVICETITAN_CLIENT_ID",
    "SERVICETITAN_CLIENT_SECRET",
  ] as const;
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
  }
  return {
    tenantId: process.env.SERVICETITAN_TENANT_ID!,
    appKey: process.env.SERVICETITAN_APP_KEY!,
    clientId: process.env.SERVICETITAN_CLIENT_ID!,
    clientSecret: process.env.SERVICETITAN_CLIENT_SECRET!,
    authUrl: process.env.SERVICETITAN_AUTH_URL ?? "https://auth.servicetitan.io/connect/token",
    apiBase: process.env.SERVICETITAN_API_BASE ?? "https://api.servicetitan.io",
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: STConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.token;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(cfg.authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ST OAuth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function stGet<T>(path: string, query: Record<string, string | number | boolean | undefined>): Promise<T> {
  const cfg = loadConfig();
  const token = await getAccessToken(cfg);
  const url = new URL(cfg.apiBase + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "ST-App-Key": cfg.appKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ST API ${res.status} on ${path}: ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as T;
}

interface STPage<T> {
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalCount: number | null;
  data: T[];
}

interface STAddress {
  street?: string;
  unit?: string | null;
  city?: string;
  state?: string;
  zip?: string;
}

interface STEntityWithAddress {
  id: number;
  name?: string;
  address?: STAddress;
}

// Page-based pagination for CRM endpoints. Hard safety cap to avoid runaways.
async function paginateCrm<T>(path: string, query: Record<string, string | number | boolean | undefined>): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const pageSize = 500;
  for (let safety = 0; safety < 400; safety++) {
    const res = await stGet<STPage<T>>(path, { ...query, page, pageSize });
    all.push(...(res.data ?? []));
    if (!res.hasMore) break;
    page += 1;
  }
  return all;
}

export interface STAddressRecord {
  street: string;
  zip: string;
  source: "customer" | "location";
}

/**
 * Pull every customer billing address and every service-location address from
 * ServiceTitan. Used to build the "existing customer" de-dupe set for mailing.
 */
export async function listCustomerAddresses(): Promise<STAddressRecord[]> {
  const cfg = loadConfig();
  const out: STAddressRecord[] = [];

  const customers = await paginateCrm<STEntityWithAddress>(
    `/crm/v2/tenant/${cfg.tenantId}/customers`,
    { active: "True" }
  );
  for (const c of customers) {
    const a = c.address;
    if (a?.street && a?.zip) out.push({ street: a.street, zip: a.zip, source: "customer" });
  }

  const locations = await paginateCrm<STEntityWithAddress>(
    `/crm/v2/tenant/${cfg.tenantId}/locations`,
    { active: "True" }
  );
  for (const l of locations) {
    const a = l.address;
    if (a?.street && a?.zip) out.push({ street: a.street, zip: a.zip, source: "location" });
  }

  return out;
}

export type AutomationEnv = {
  ODOO_URL: string;
  ODOO_DB: string;
  ODOO_USER: string;
  ODOO_PASSWORD: string;
};

function requireEnv(name: keyof AutomationEnv): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getAutomationEnv(): AutomationEnv {
  return {
    ODOO_URL: requireEnv("ODOO_URL").replace(/\/$/, ""),
    ODOO_DB: requireEnv("ODOO_DB"),
    ODOO_USER: requireEnv("ODOO_USER"),
    ODOO_PASSWORD: requireEnv("ODOO_PASSWORD"),
  };
}

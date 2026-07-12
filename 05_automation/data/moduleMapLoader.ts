import { readFileSync } from "node:fs";
import path from "node:path";

export type ModuleMapEntry = {
  module: string;
  menuPath: string | null;
  actionUrl: string;
  actionId: number | null;
  actionRef: string | null;
  columns: string[];
  formFields: Array<{
    name: string;
    label: string;
    required: boolean;
  }>;
};

type AppMapPayload = {
  generatedAt: string;
  baseUrl: string;
  modules: ModuleMapEntry[];
};

export function loadModuleMap(
  filePath = path.join(__dirname, "..", "..", "artifacts", "app_map.json")
): AppMapPayload {
  return JSON.parse(readFileSync(filePath, "utf8")) as AppMapPayload;
}

export function getModuleEntry(moduleName: string): ModuleMapEntry {
  const map = loadModuleMap();
  const entry = map.modules.find((m) => m.module === moduleName);
  if (!entry) {
    throw new Error(`Module "${moduleName}" not found in artifacts/app_map.json`);
  }
  return entry;
}

import { readFileSync } from "node:fs";
import path from "node:path";

export type ScenarioRef = {
  scenarioId: string;
  linkedRequirementIds: string[];
};

export function loadScenarios(
  filePath = path.join(__dirname, "..", "..", "03_scenarios", "scenarios.md")
): ScenarioRef[] {
  const raw = readFileSync(filePath, "utf8");

  const ids = Array.from(raw.matchAll(/^## ScenarioID:\s*(.+)$/gm)).map((m) => ({
    id: m[1].trim(),
    index: m.index ?? 0,
  }));

  const sections = ids.map((entry, i) => {
    const start = entry.index;
    const end = i + 1 < ids.length ? ids[i + 1].index : raw.length;
    return raw.slice(start, end);
  });

  return sections
    .map((section) => {
      const scenarioId = /^## ScenarioID:\s*(.+)$/m.exec(section)?.[1]?.trim() ?? "";
      const linkedRaw = /- LinkedRequirementIDs:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
      const linkedRequirementIds = linkedRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      if (!scenarioId) return null;
      return { scenarioId, linkedRequirementIds };
    })
    .filter((x): x is ScenarioRef => x !== null);
}

import { runApoRecommendation } from "../apo/service";
import { runDsmSimulation } from "../dsm/service";
import { queryVectorKnowledge } from "../gria/service";
import { analyzeMapZone } from "../map/service";
import { runSroaOptimization } from "../sroa/service";
import { getTfmLiveSnapshot } from "../tfm/service";

type DynamicImport = <T = any>(specifier: string) => Promise<T>;
const dynamicImport = new Function("specifier", "return import(specifier)") as DynamicImport;

export const VarunaToolHandlers = {
  gria_retrieve: queryVectorKnowledge,
  dsm_simulate: runDsmSimulation,
  sroa_optimize: runSroaOptimization,
  apo_recommend: runApoRecommendation,
  tfm_snapshot: getTfmLiveSnapshot,
  map_zone_analyze: analyzeMapZone,
};

const toolDefinitions = [
  {
    name: "gria_retrieve",
    description: "Retrieve GRIA geopolitical/news intelligence from the existing MongoDB vector search.",
    handler: VarunaToolHandlers.gria_retrieve,
  },
  {
    name: "dsm_simulate",
    description: "Run the existing DSM disruption scenario simulation.",
    handler: VarunaToolHandlers.dsm_simulate,
  },
  {
    name: "sroa_optimize",
    description: "Run the existing SROA strategic reserve optimization.",
    handler: VarunaToolHandlers.sroa_optimize,
  },
  {
    name: "apo_recommend",
    description: "Run the existing APO alternate procurement ranking.",
    handler: VarunaToolHandlers.apo_recommend,
  },
  {
    name: "tfm_snapshot",
    description: "Read the existing Supply Chain Digital Twin live snapshot.",
    handler: VarunaToolHandlers.tfm_snapshot,
  },
  {
    name: "map_zone_analyze",
    description: "Run the existing map tension-zone workflow.",
    handler: VarunaToolHandlers.map_zone_analyze,
  },
];

export const getVarunaToolDefinitions = () => toolDefinitions.map(({ name, description }) => ({ name, description }));

export const getOptionalLangChainTools = async (): Promise<unknown[]> => {
  try {
    const imported = await dynamicImport<{ tool?: (fn: (args: unknown) => Promise<unknown>, config: Record<string, unknown>) => unknown }>("@langchain/core/tools");
    const tool = imported.tool;
    if (!tool) return [];
    return toolDefinitions.map((definition) =>
      tool(
        async (args: unknown) => definition.handler(args as never),
        {
          name: definition.name,
          description: definition.description,
        }
      )
    );
  } catch {
    return [];
  }
};

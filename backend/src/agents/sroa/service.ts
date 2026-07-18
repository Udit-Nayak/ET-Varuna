import { DsmSimulationOutput } from "../dsm/types";
import { runDsmSimulation } from "../dsm/service";
import { optimizeReserveDrawdown } from "./engine";
import { getLatestOperationalData } from "./repository";
import { explainSroaOutput, formatSroaInput } from "./llm";
import { SroaInput, SroaOutput } from "./types";

const resolveDsmOutput = async (input: SroaInput): Promise<DsmSimulationOutput> => {
  if (input.dsm_output) return input.dsm_output;
  return runDsmSimulation(
    input.dsm_request ?? {
      corridor: input.corridor ?? "general",
      scenario_text: input.scenario_text ?? "Run DSM before SROA reserve optimization",
    }
  );
};

export const runSroaOptimization = async (input: SroaInput): Promise<SroaOutput> => {
  const formatted = await formatSroaInput(input);
  const dsmOutput = await resolveDsmOutput(formatted.input);
  const operationalData = await getLatestOperationalData();
  const deterministicOutput = optimizeReserveDrawdown(
    { ...formatted.input, corridor: formatted.input.corridor ?? dsmOutput.corridor },
    dsmOutput,
    operationalData
  );
  const explained = await explainSroaOutput(formatted.input, operationalData, deterministicOutput);

  return {
    ...deterministicOutput,
    summary: explained.summary,
    input_formatting: formatted.formatting,
    sanity_check: explained.sanity_check,
  };
};

export const getSroaStatus = async (): Promise<{ operational_data: Awaited<ReturnType<typeof getLatestOperationalData>> }> => ({
  operational_data: await getLatestOperationalData(),
});

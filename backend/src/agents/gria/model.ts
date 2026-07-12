import { spawn } from "child_process";
import path from "path";

export interface HuggingFaceInferenceRequest {
  article: {
    title: string;
    description: string;
    content: string;
    source: string;
    publishedAt: string;
  };
}

const PYTHON_SCRIPT = path.resolve(__dirname, "model.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

let workerReadyPromise: Promise<void> | null = null;
let workerProcess: ReturnType<typeof spawn> | null = null;
let workerBuffer = "";
let workerRequestQueue: Array<{
  payload: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];
let workerBusy = false;

const parseModelText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const obj = value as { text?: unknown; generated_text?: unknown; content?: unknown };
    return String(obj.text ?? obj.generated_text ?? obj.content ?? "");
  }
  return "";
};

const ensureWorker = (): Promise<void> => {
  if (workerReadyPromise) {
    return workerReadyPromise;
  }

  workerReadyPromise = new Promise((resolve, reject) => {
    workerProcess = spawn(PYTHON_BIN, [PYTHON_SCRIPT], {
      cwd: path.dirname(PYTHON_SCRIPT),
      stdio: ["pipe", "pipe", "pipe"],
    });

    workerProcess.on("error", reject);
    workerProcess.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    workerProcess.on("exit", (code) => {
      workerReadyPromise = null;
      workerProcess = null;
      workerBuffer = "";
      if (code && code !== 0) {
        reject(new Error(`Gemma worker exited with code ${code}`));
      }
    });

    resolve();
  });

  return workerReadyPromise;
};

const pumpQueue = (): void => {
  if (!workerProcess || workerBusy || workerRequestQueue.length === 0) {
    return;
  }

  const current = workerRequestQueue.shift();
  if (!current) {
    return;
  }

  workerBusy = true;
  const onData = (chunk: Buffer) => {
    workerBuffer += chunk.toString("utf8");
    const newlineIndex = workerBuffer.indexOf("\n");
    if (newlineIndex === -1) {
      return;
    }

    const line = workerBuffer.slice(0, newlineIndex).trim();
    workerBuffer = workerBuffer.slice(newlineIndex + 1);

    try {
      const parsed = JSON.parse(line) as { ok?: boolean; text?: unknown; error?: string };
      if (!parsed.ok) {
        current.reject(new Error(parsed.error || "Gemma worker error"));
      } else {
        current.resolve(parsed.text);
      }
    } catch (error) {
      current.reject(error);
    } finally {
      workerProcess?.stdout?.off("data", onData);
      workerBusy = false;
      pumpQueue();
    }
  };

  workerProcess.stdout?.on("data", onData);
  workerProcess.stdin?.write(`${current.payload}\n`);
};

const invokeModel = async (article: HuggingFaceInferenceRequest["article"]): Promise<unknown> => {
  await ensureWorker();
  if (!workerProcess) {
    throw new Error("Gemma worker is not available");
  }

  return await new Promise((resolve, reject) => {
    workerRequestQueue.push({
      payload: JSON.stringify({ article }),
      resolve,
      reject,
    });
    pumpQueue();
  });
};

export async function generateRawOutput(input: HuggingFaceInferenceRequest): Promise<unknown> {
  return invokeModel(input.article);
}

export const extractModelText = parseModelText;

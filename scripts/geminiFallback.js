const DEFAULT_GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export async function generateContentWithFallback(ai, request) {
  const models = getGeminiModelCandidates();
  let lastError = null;

  for (const model of models) {
    try {
      // console.log(`Model: ${model}`);

      const response = await ai.models.generateContent({
        ...request,
        model,
      });

      return { response, model };
    } catch (error) {
      lastError = error;
      // console.warn(`Gemini model failed (${model}): ${getErrorMessage(error)}`);

      if (!isFallbackError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function getGeminiModelCandidates() {
  const configuredModels = [
    process.env.GEMINI_MODEL,
    ...(process.env.GEMINI_MODEL_FALLBACKS || "")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
  ].filter(Boolean);

  return [...new Set([...configuredModels, ...DEFAULT_GEMINI_MODELS])];
}

function isFallbackError(error) {
  const message = getErrorMessage(error).toLowerCase();

  return [
    "429",
    "500",
    "502",
    "503",
    "504",
    "unavailable",
    "resource_exhausted",
    "internal",
    "deadline_exceeded",
    "fetch failed",
    "network",
    "timeout",
    "timed out",
    "etimedout",
    "econnreset",
    "econnrefused",
    "enotfound",
    "socket",
    "terminated",
    "not_found",
    "model not found",
    "high demand",
  ].some((pattern) => message.includes(pattern));
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

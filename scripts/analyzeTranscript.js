import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { YoutubeTranscript } from "youtube-transcript";
import { GoogleGenAI } from "@google/genai";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { generateContentWithFallback } from "./geminiFallback.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, ".env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function cleanJson(text) {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

async function getTranscript(videoUrl) {
  const transcriptArray = await YoutubeTranscript.fetchTranscript(videoUrl);
  return transcriptArray.map((item) => item.text).join(" ");
}

async function analyzeTeachingStyle(transcript) {
  const prompt = `
Analyze this teaching transcript and classify the teaching style using VARK.

VARK categories:
- Visual
- Auditory
- Reading/Writing
- Kinesthetic

Return JSON only:
{
  "Visual": 0,
  "Auditory": 0,
  "Reading/Writing": 0,
  "Kinesthetic": 0,
  "final_style": "",
  "reason": ""
}

Rules:
- final_style must be only one of Visual, Auditory, Reading/Writing, Kinesthetic.
- Do not return Multimodal.

Transcript:
${transcript}
`;

  const { response, model } = await generateContentWithFallback(ai, {
    contents: prompt,
  });

  console.log(`Gemini transcript model used: ${model}`);

  return JSON.parse(cleanJson(response.text));
}

async function processTranscriptAnalysis() {
  const { data, error } = await supabase
    .from("video")
    .select("*")
    .eq("transcript_analysis_status", "pending");

  if (error) {
    console.error("Fetch error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No pending transcript videos found.");
    return;
  }

  for (const video of data) {
    console.log(`Transcript analyzing video ${video.vid}: ${video.name}`);

    await supabase
      .from("video")
      .update({ transcript_analysis_status: "processing" })
      .eq("vid", video.vid);

    try {
      const transcript = await getTranscript(video.url);
      console.log("Transcript generated.");

      const styleResult = await analyzeTeachingStyle(transcript);
      console.log("Transcript result:", styleResult);

      const { error: updateError } = await supabase
        .from("video")
        .update({
          transcript_teachingstyle: styleResult.final_style,
          transcript_analysis_status: "completed",
        })
        .eq("vid", video.vid);

      if (updateError) throw updateError;

      console.log(`Video ${video.vid} transcript analysis completed.`);
    } catch (err) {
      console.error(`Video ${video.vid} failed:`, err.message);

      await supabase
        .from("video")
        .update({ transcript_analysis_status: "failed" })
        .eq("vid", video.vid);
    }
  }
}

processTranscriptAnalysis();

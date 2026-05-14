import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { generateContentWithFallback } from "./geminiFallback.js";

const execAsync = promisify(exec);
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

async function downloadYoutube(videoUrl, outputPath) {
  const command = `yt-dlp -f "mp4/best" -o "${outputPath}" "${videoUrl}"`;
  await execAsync(command);

  if (!fs.existsSync(outputPath)) {
    throw new Error("Video download failed");
  }
}

async function extractFrames(videoPath, framesDir) {
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  const command = `ffmpeg -i "${videoPath}" -vf fps=1/30 "${framesDir}/frame_%03d.jpg"`;
  await execAsync(command);

  return fs
    .readdirSync(framesDir)
    .filter((file) => file.endsWith(".jpg"))
    .map((file) => path.join(framesDir, file));
}

function imageToPart(filePath) {
  const imageData = fs.readFileSync(filePath);

  return {
    inlineData: {
      data: imageData.toString("base64"),
      mimeType: "image/jpeg",
    },
  };
}

async function analyzeFrames(framePaths) {
  const selectedFrames = framePaths.slice(0, 8);

  const prompt = `
Analyze these video frames and classify the teaching style using VARK.

Categories:
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
- Visual = diagrams, charts, animations, images.
- Reading/Writing = text-heavy slides, code, written notes.
- Kinesthetic = demonstrations, practical actions, hands-on activity.
- Auditory = mostly talking-head explanation with little visual content.
`;

  const imageParts = selectedFrames.map(imageToPart);

  const { response, model } = await generateContentWithFallback(ai, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
  });

  // console.log(`Gemini frame model used: ${model}`);

  return JSON.parse(cleanJson(response.text));
}

function cleanup(videoPath, framesDir) {
  if (fs.existsSync(videoPath)) {
    fs.unlinkSync(videoPath);
  }

  if (fs.existsSync(framesDir)) {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
}

async function processFrameAnalysis() {
  const { data, error } = await supabase
    .from("video")
    .select("*")
    .eq("frames_analysis_status", "pending");

  if (error) {
    console.error("Fetch error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No pending frame videos found.");
    return;
  }

  for (const video of data) {
    console.log(`Frame analyzing video ${video.vid}: ${video.name}`);

    const videoPath = path.join(scriptDir, "temp", "videos", `video_${video.vid}.mp4`);
    const framesDir = path.join(scriptDir, "temp", "frames", `video_${video.vid}`);

    await supabase
      .from("video")
      .update({ frames_analysis_status: "processing" })
      .eq("vid", video.vid);

    try {
      console.log("Downloading the video...");
      await downloadYoutube(video.url, videoPath);

      console.log("Extracting frames...");
      const framePaths = await extractFrames(videoPath, framesDir);

      console.log(`Extracted ${framePaths.length} frames.`);

      // console.log("Analyzing frames with Gemini...");
      const frameResult = await analyzeFrames(framePaths);

      console.log("Frame result:", frameResult);

      const { error: updateError } = await supabase
        .from("video")
        .update({
          frames_teachingstyle: frameResult.final_style,
          frames_analysis_status: "completed",
        })
        .eq("vid", video.vid);

      if (updateError) throw updateError;

      cleanup(videoPath, framesDir);

      console.log(`Video ${video.vid} frame analysis completed.`);
    } catch (err) {
      console.error(`Video ${video.vid} failed:`, err.message);

      cleanup(videoPath, framesDir);

      await supabase
        .from("video")
        .update({ frames_analysis_status: "failed" })
        .eq("vid", video.vid);
    }
  }
}

processFrameAnalysis();

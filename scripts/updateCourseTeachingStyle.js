import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, ".env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STYLE_MAP = {
  Visual: "v",
  Aural: "a",
  Auditory: "a",
  "Reading/Writing": "r",
  "Read/write": "r",
  "Read/Write": "r",
  Kinesthetic: "k",
};

const STYLE_ORDER = ["v", "a", "r", "k"];

function normalizeStyle(style) {
  if (!style) return null;
  return STYLE_MAP[style.trim()] || null;
}

function getCourseStyle(counts) {
  const max = Math.max(counts.v, counts.a, counts.r, counts.k);

  if (max === 0) return null;

  const winners = STYLE_ORDER.filter((style) => counts[style] === max);

  if (winners.length === 1) {
    const style = winners[0];

    const total = counts.v + counts.a + counts.r + counts.k;
    const percentage = max / total;

    if (style === "v") {
      if (percentage >= 0.75) return "very_strong_visual";
      if (percentage >= 0.55) return "strong_visual";
      return "mild_visual";
    }

    if (style === "a") {
      if (percentage >= 0.75) return "very_strong_aural";
      if (percentage >= 0.55) return "strong_aural";
      return "mild_aural";
    }

    if (style === "r") {
      if (percentage >= 0.75) return "very_strong_read_write";
      if (percentage >= 0.55) return "strong_read_write";
      return "mild_read_write";
    }

    if (style === "k") {
      if (percentage >= 0.75) return "very_strong_kinesthetic";
      if (percentage >= 0.55) return "strong_kinesthetic";
      return "mild_kinesthetic";
    }
  }

  return winners.join("");
}

async function updateCourseTeachingStyles() {
  const { data: courses, error: courseError } = await supabase
    .from("course")
    .select("cid, name");

  if (courseError) {
    console.error("Course fetch error:", courseError.message);
    return;
  }

  for (const course of courses || []) {
    console.log(`Checking course ${course.cid}: ${course.name}`);

    const { data: videos, error: videoError } = await supabase
      .from("video")
      .select(`
        vid,
        transcript_teachingstyle,
        frames_teachingstyle,
        transcript_analysis_status,
        frames_analysis_status,
        lesson!inner (
          cid
        )
      `)
      .eq("lesson.cid", course.cid)
      .eq("transcript_analysis_status", "completed")
      .eq("frames_analysis_status", "completed");

    if (videoError) {
      console.error("Video fetch error:", videoError.message);
      continue;
    }

    const counts = {
      v: 0,
      a: 0,
      r: 0,
      k: 0,
    };

    for (const video of videos || []) {
      const transcriptStyle = normalizeStyle(video.transcript_teachingstyle);
      const frameStyle = normalizeStyle(video.frames_teachingstyle);

      if (transcriptStyle) counts[transcriptStyle]++;
      if (frameStyle) counts[frameStyle]++;
    }

    const finalStyle = getCourseStyle(counts);

    if (!finalStyle) {
      console.log(`No completed styles for course ${course.cid}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("course")
      .update({
        teachingstyle: finalStyle,
      })
      .eq("cid", course.cid);

    if (updateError) {
      console.error("Course update error:", updateError.message);
      continue;
    }

    console.log("Counts:", counts);
    console.log(`Course ${course.cid} updated to: ${finalStyle}`);
    console.log("-----------------------------");
  }
}

updateCourseTeachingStyles();

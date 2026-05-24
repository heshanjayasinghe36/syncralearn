import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, ".env") });
config({ path: resolve(scriptDir, "..", ".env") });

const args = process.argv.slice(2);
const STYLE_ORDER = ["v", "a", "r", "k"];
const STYLE_LABELS = {
  v: "visual",
  a: "aural",
  r: "read_write",
  k: "kinesthetic",
};
const STYLE_MAP = {
  v: ["v"],
  visual: ["v"],
  a: ["a"],
  aural: ["a"],
  auditory: ["a"],
  r: ["r"],
  read_write: ["r"],
  readwrite: ["r"],
  "read/write": ["r"],
  "read-write": ["r"],
  k: ["k"],
  kinesthetic: ["k"],
};

let supabase;

function getArgValue(name) {
  const prefix = `--${name}=`;
  const inlineArg = args.find((arg) => arg.startsWith(prefix));

  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  const argIndex = args.findIndex((arg) => arg === `--${name}`);
  return argIndex >= 0 ? args[argIndex + 1] : null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function validateEnvironment() {
  const missing = [
    ["SUPABASE_URL", process.env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function normalizeCourseStyle(style) {
  const rawStyle = String(style || "").trim();
  const normalizedStyle = rawStyle
    .toLowerCase()
    .replace(/read\s*\/?\s*write/g, "read_write")
    .replace(/\s+/g, "_");

  if (!normalizedStyle) {
    return [];
  }

  if (STYLE_MAP[normalizedStyle]) {
    return STYLE_MAP[normalizedStyle];
  }

  if (/^[vark]+$/.test(normalizedStyle)) {
    return [...new Set(normalizedStyle.split(""))].filter((styleKey) =>
      STYLE_ORDER.includes(styleKey)
    );
  }

  const styleKeys = new Set();
  const tokens = normalizedStyle.split(/[^a-z]+/).filter(Boolean);

  for (const token of tokens) {
    const mappedStyles = STYLE_MAP[token] || [];
    mappedStyles.forEach((styleKey) => styleKeys.add(styleKey));
  }

  return STYLE_ORDER.filter((styleKey) => styleKeys.has(styleKey));
}

function getMainTeachingStyle(counts) {
  const max = Math.max(counts.v, counts.a, counts.r, counts.k);

  if (max === 0) {
    return null;
  }

  const winners = STYLE_ORDER.filter((style) => counts[style] === max);

  if (winners.length === 1) {
    return STYLE_LABELS[winners[0]];
  }

  return winners.join("");
}

function countCourseTeachingStyles(courses) {
  const counts = {
    v: 0,
    a: 0,
    r: 0,
    k: 0,
  };

  for (const course of courses) {
    const styles = normalizeCourseStyle(course.teachingstyle);

    for (const style of styles) {
      counts[style]++;
    }
  }

  return counts;
}

async function fetchTeachers(teacherId = null) {
  let query = supabase
    .from("teacher")
    .select("tid, full_name, mts")
    .order("tid", { ascending: true });

  if (teacherId) {
    query = query.eq("tid", teacherId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Teacher fetch failed: ${error.message}`);
  }

  return data || [];
}

async function fetchTeacherCourses(teacherId) {
  const { data, error } = await supabase
    .from("course")
    .select("cid, name, teachingstyle")
    .eq("tid", teacherId)
    .not("teachingstyle", "is", null);

  if (error) {
    throw new Error(`Course fetch failed for teacher ${teacherId}: ${error.message}`);
  }

  return data || [];
}

async function updateTeacherTeachingStyle(teacher) {
  const courses = await fetchTeacherCourses(teacher.tid);
  const counts = countCourseTeachingStyles(courses);
  const nextTeachingStyle = getMainTeachingStyle(counts);

  if (!nextTeachingStyle) {
    console.log(
      `Teacher ${teacher.tid} has no course teaching styles. Skipped.`
    );
    return;
  }

  if (teacher.mts === nextTeachingStyle) {
    console.log(
      `Teacher ${teacher.tid} unchanged: ${nextTeachingStyle}`,
      counts
    );
    return;
  }

  if (hasFlag("dry-run")) {
    console.log(
      `Dry run: teacher ${teacher.tid} would change from ${
        teacher.mts || "not set"
      } to ${nextTeachingStyle}`,
      counts
    );
    return;
  }

  const { error } = await supabase
    .from("teacher")
    .update({ mts: nextTeachingStyle })
    .eq("tid", teacher.tid);

  if (error) {
    throw new Error(`Teacher ${teacher.tid} update failed: ${error.message}`);
  }

  console.log(
    `Teacher ${teacher.tid} updated from ${teacher.mts || "not set"} to ${nextTeachingStyle}`,
    counts
  );
}

async function updateTeacherTeachingStyles({ teacherId = null } = {}) {
  const teachers = await fetchTeachers(teacherId);

  if (teachers.length === 0) {
    console.log(teacherId ? `Teacher ${teacherId} not found.` : "No teachers found.");
    return;
  }

  for (const teacher of teachers) {
    try {
      await updateTeacherTeachingStyle(teacher);
    } catch (error) {
      console.error(error.message);
    }
  }
}

function listenForCourseChanges() {
  const pendingTeacherUpdates = new Map();

  function scheduleTeacherUpdate(teacherId) {
    if (!teacherId) {
      return;
    }

    const existingTimer = pendingTeacherUpdates.get(teacherId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      pendingTeacherUpdates.delete(teacherId);
      await updateTeacherTeachingStyles({ teacherId });
    }, 750);

    pendingTeacherUpdates.set(teacherId, timer);
  }

  const channel = supabase
    .channel("teacher-teaching-style-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "course" },
      (payload) => {
        const teacherIds = new Set(
          [payload.new?.tid, payload.old?.tid].filter(Boolean)
        );

        for (const teacherId of teacherIds) {
          scheduleTeacherUpdate(teacherId);
        }
      }
    )
    .subscribe((status) => {
      console.log(`Course teaching style listener status: ${status}`);
    });

  async function shutdown() {
    console.log("Stopping course teaching style listener.");
    await supabase.removeChannel(channel);
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  validateEnvironment();
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const teacherId = getArgValue("teacher");

  await updateTeacherTeachingStyles({ teacherId });

  if (hasFlag("watch")) {
    listenForCourseChanges();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

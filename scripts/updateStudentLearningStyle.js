import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  getVarkStyleKeys,
  inferVarkPreferenceFromStyles,
} from "../src/lib/vark.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, ".env") });
config({ path: resolve(scriptDir, "..", ".env") });

const args = process.argv.slice(2);
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

async function fetchStudents(studentId = null) {
  let query = supabase
    .from("student")
    .select("sid, full_name, mls")
    .order("sid", { ascending: true });

  if (studentId) {
    query = query.eq("sid", studentId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Student fetch failed: ${error.message}`);
  }

  return data || [];
}

async function fetchStudentCourseStyles(studentId) {
  const { data, error } = await supabase
    .from("student_course")
    .select(
      `
      course (
        teachingstyle
      )
    `
    )
    .eq("sid", studentId);

  if (error) {
    throw new Error(
      `Enrolled course fetch failed for student ${studentId}: ${error.message}`
    );
  }

  return (data || []).map((row) => row.course?.teachingstyle || "");
}

async function updateStudentLearningStyle(student) {
  if (getVarkStyleKeys(student.mls).length > 0) {
    console.log(`Student ${student.sid} already has a learning style. Skipped.`);
    return;
  }

  const courseStyles = await fetchStudentCourseStyles(student.sid);
  const nextLearningStyle = inferVarkPreferenceFromStyles(courseStyles);

  if (!nextLearningStyle) {
    console.log(`Student ${student.sid} has no styled enrolled courses. Skipped.`);
    return;
  }

  if (hasFlag("dry-run")) {
    console.log(
      `Dry run: student ${student.sid} would be set to ${nextLearningStyle}.`
    );
    return;
  }

  let query = supabase
    .from("student")
    .update({ mls: nextLearningStyle })
    .eq("sid", student.sid);

  query =
    student.mls === null || student.mls === undefined
      ? query.is("mls", null)
      : query.eq("mls", student.mls);

  const { data, error } = await query.select("sid, mls").maybeSingle();

  if (error) {
    throw new Error(`Student ${student.sid} update failed: ${error.message}`);
  }

  if (!data) {
    console.log(`Student ${student.sid} changed before update. Skipped.`);
    return;
  }

  console.log(`Student ${student.sid} learning style set to ${nextLearningStyle}.`);
}

async function updateStudentLearningStyles({ studentId = null } = {}) {
  const students = await fetchStudents(studentId);

  if (students.length === 0) {
    console.log(studentId ? `Student ${studentId} not found.` : "No students found.");
    return;
  }

  for (const student of students) {
    try {
      await updateStudentLearningStyle(student);
    } catch (error) {
      console.error(error.message);
    }
  }
}

function listenForEnrollmentChanges() {
  const pendingStudentUpdates = new Map();

  function scheduleStudentUpdate(studentId) {
    if (!studentId) {
      return;
    }

    const existingTimer = pendingStudentUpdates.get(studentId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      pendingStudentUpdates.delete(studentId);
      await updateStudentLearningStyles({ studentId });
    }, 750);

    pendingStudentUpdates.set(studentId, timer);
  }

  const enrollmentChannel = supabase
    .channel("student-learning-style-enrollment-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "student_course" },
      (payload) => {
        const studentIds = new Set(
          [payload.new?.sid, payload.old?.sid].filter(Boolean)
        );

        for (const studentId of studentIds) {
          scheduleStudentUpdate(studentId);
        }
      }
    )
    .subscribe((status) => {
      console.log(`Student enrollment listener status: ${status}`);
    });

  const courseChannel = supabase
    .channel("student-learning-style-course-sync")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "course" },
      async (payload) => {
        if (payload.new?.teachingstyle === payload.old?.teachingstyle) {
          return;
        }

        const { data, error } = await supabase
          .from("student_course")
          .select("sid")
          .eq("cid", payload.new?.cid);

        if (error) {
          console.error(`Student enrollment lookup failed: ${error.message}`);
          return;
        }

        for (const row of data || []) {
          scheduleStudentUpdate(row.sid);
        }
      }
    )
    .subscribe((status) => {
      console.log(`Student course style listener status: ${status}`);
    });

  async function shutdown() {
    console.log("Stopping student learning style listeners.");
    await Promise.all([
      supabase.removeChannel(enrollmentChannel),
      supabase.removeChannel(courseChannel),
    ]);
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

  const studentId = getArgValue("student");

  await updateStudentLearningStyles({ studentId });

  if (hasFlag("watch")) {
    listenForEnrollmentChanges();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

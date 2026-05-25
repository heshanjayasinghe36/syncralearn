import {
  Sparkles,
  Clock,
  Plus,
  X,
  CalendarDays,
  Pencil,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../../lib/supabase";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const initialAvailability = {
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
  Saturday: [],
  Sunday: [],
};

const getTodayDayName = () =>
  new Date().toLocaleDateString("en-US", { weekday: "long" });

const getTotalMinutes = (sessions) =>
  sessions.reduce(
    (total, session) => total + Number(session.durationMinutes || 0),
    0
  );

const formatDuration = (minutes) => {
  if (!minutes) {
    return "0h";
  }

  const hours = minutes / 60;

  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }

  return `${hours.toFixed(1)}h`;
};

function StudentStudyPlanPage() {
  const [availability, setAvailability] = useState(initialAvailability);
  const [studyPlan, setStudyPlan] = useState(null);
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const getStudentId = async () => {
    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return null;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data: studentData, error: studentError } = await supabase
      .from("student")
      .select("sid")
      .eq("auth_user_id", user.id)
      .single();

    if (studentError || !studentData) {
      return null;
    }

    return studentData.sid;
  };

  const loadAvailability = async (sid) => {
    const { data, error } = await supabase
      .from("student_study_availability")
      .select("day_of_week, start_time, end_time, availability_id")
      .eq("sid", sid)
      .order("availability_id", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    const loadedAvailability = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
    };

    data.forEach((row) => {
      if (loadedAvailability[row.day_of_week]) {
        loadedAvailability[row.day_of_week].push({
          start: row.start_time?.slice(0, 5) || "00:00",
          end: row.end_time?.slice(0, 5) || "23:59",
        });
      }
    });

    setAvailability(loadedAvailability);
  };

  const loadStudyPlan = async (sid) => {
    const { data, error } = await supabase
      .from("student_study_plan")
      .select("plan_id, plan_json, generated_at, model")
      .eq("sid", sid)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);
      setStudyPlan(null);
      return;
    }

    if (data?.plan_json) {
      setStudyPlan(data);
      setShowAvailabilityForm(false);
    } else {
      setStudyPlan(null);
      setShowAvailabilityForm(true);
    }
  };

  const loadPageData = async () => {
    try {
      setLoading(true);

      const sid = await getStudentId();

      if (!sid) {
        setLoading(false);
        return;
      }

      await loadAvailability(sid);
      await loadStudyPlan(sid);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPageData();
  }, []);

  const addTimeSlot = (day) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: [...prev[day], { start: "00:00", end: "23:59" }],
    }));
  };

  const removeTimeSlot = (day, index) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }));
  };

  const updateTimeSlot = (day, index, field, value) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: prev[day].map((slot, i) =>
        i === index ? { ...slot, [field]: value } : slot
      ),
    }));
  };

  const generatePlan = async () => {
    try {
      setSaving(true);
      setMessage("");

      const sid = await getStudentId();

      if (!sid) {
        setMessage("Student profile was not found.");
        return;
      }

      const availabilityRows = [];

      Object.entries(availability).forEach(([day, slots]) => {
        slots.forEach((slot) => {
          if (slot.start && slot.end) {
            availabilityRows.push({
              sid,
              day_of_week: day,
              start_time: slot.start,
              end_time: slot.end,
            });
          }
        });
      });

      if (availabilityRows.length === 0) {
        setMessage("Add at least one available time slot.");
        return;
      }

      const invalidSlot = availabilityRows.find(
        (slot) => slot.start_time >= slot.end_time
      );

      if (invalidSlot) {
        setMessage(`${invalidSlot.day_of_week} has an invalid time slot.`);
        return;
      }

      const { error: deleteError } = await supabase
        .from("student_study_availability")
        .delete()
        .eq("sid", sid);

      if (deleteError) {
        console.error(deleteError);
        setMessage("Availability could not be updated.");
        return;
      }

      const { error: insertError } = await supabase
        .from("student_study_availability")
        .insert(availabilityRows);

      if (insertError) {
        console.error(insertError);
        setMessage("Availability could not be saved.");
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "generate-student-study-plan",
        {
          body: { sid },
        }
      );

      if (error) {
        console.error(error);
        setMessage("Availability saved. Study plan could not be created yet.");
        await loadAvailability(sid);
        return;
      }

      if (data?.plan) {
        setStudyPlan({
          plan_id: data.planId || data.generatedAt || Date.now(),
          plan_json: data.plan,
          generated_at: data.generatedAt || new Date().toISOString(),
          model: data.model || "",
        });
        setShowAvailabilityForm(false);
        setMessage("");
      } else {
        setMessage("Availability saved. Study plan is not ready yet.");
      }

      await loadAvailability(sid);
    } catch (error) {
      console.error(error);
      setMessage("Study plan could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const plan = studyPlan?.plan_json;
  const todayName = getTodayDayName();
  const dayPlans = days.map((day, index) => {
    const dayPlan = plan?.days?.find((item) => item.day === day);
    const sessions = dayPlan?.sessions || [];

    return {
      day,
      index,
      sessions,
      totalMinutes: getTotalMinutes(sessions),
    };
  });

  const todayIndex = days.indexOf(todayName);
  const currentDayIndex = (() => {
    const upcomingStudyDay = dayPlans.findIndex(
      (dayPlan, index) => index >= todayIndex && dayPlan.sessions.length > 0
    );

    if (upcomingStudyDay >= 0) {
      return upcomingStudyDay;
    }

    const firstStudyDay = dayPlans.findIndex(
      (dayPlan) => dayPlan.sessions.length > 0
    );

    return firstStudyDay;
  })();

  return (
    <div className="study-plan-page">
      {(!studyPlan || showAvailabilityForm) && (
  <div className="study-plan-hero">
    <div className="study-plan-badge">
      <Sparkles size={14} />
      Weekly schedule
    </div>

    <h1>Your Study Plan</h1>
    <p>
      Set the times you can study each week. Your plan keeps sessions inside
      those slots.
    </p>
  </div>
)}

      {loading ? (
        <p className="study-plan-loading">Loading study plan...</p>
      ) : studyPlan && !showAvailabilityForm ? (
        <>
          <div className="weekly-header">
            <h2>Your Study Plan</h2>

            <button
              type="button"
              className="adjust-availability-btn"
              onClick={() => setShowAvailabilityForm(true)}
            >
              <Pencil size={14} />
              Adjust Availability
            </button>
          </div>

          <section className="study-plan-results">
            <div className="study-plan-summary-card">
              <div>
                <span className="study-plan-small-label">
                  <Sparkles size={13} />
                  Weekly Goal
                </span>
                <h3>{plan?.weeklyGoal || "Your weekly study plan"}</h3>
                <p>{plan?.summary || "Your study schedule for this week."}</p>
              </div>

              <div className="study-plan-hours-card">
                <strong>{plan?.totalStudyHours || 0}</strong>
                <span>Study Hours</span>
              </div>
            </div>

            <div className="study-plan-journey">
              <div className="study-plan-journey-header">
                <div>
                  <span className="study-plan-small-label">
                    <CalendarDays size={13} />
                    Learning Journey
                  </span>
                  <h3>This week's focus blocks</h3>
                  {/* <p>Hover over a day card to see the full study sessions planned for that day.</p> */}
                </div>
              </div>

              <div className="study-plan-days-list">
              {dayPlans.map(({ day, index, sessions, totalMinutes }) => {
                const isCurrent = index === currentDayIndex;
                const isComplete = currentDayIndex >= 0 && index < currentDayIndex && sessions.length > 0;
                const isEmpty = sessions.length === 0;

                return (
                  <div
                    className={[
                      "study-plan-day-node",
                      index % 2 === 0 ? "align-left" : "align-right",
                      isCurrent ? "is-current" : "",
                      isComplete ? "is-complete" : "",
                      isEmpty ? "is-empty" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={day}
                  >
                    <div className="study-plan-day-rail-marker" aria-hidden="true">
                      {isComplete ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <BookOpen size={18} />
                      )}
                    </div>

                    <div className="study-plan-day-card" tabIndex={0}>
                      {isCurrent ? (
                        <span className="study-plan-current-badge">Current Focus</span>
                      ) : null}

                      <div className="study-plan-day-header">
                        <h3>
                          <CalendarDays size={16} />
                          {day}
                        </h3>
                        <span>
                          {sessions.length} session{sessions.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="study-plan-day-overview">
                        <div className="study-plan-day-icon">
                          {isComplete ? <CheckCircle2 size={22} /> : <BookOpen size={22} />}
                        </div>

                        <div className="study-plan-day-copy">
                          <h4>
                            {sessions[0]?.taskTitle ||
                              (isCurrent
                                ? "Light recovery day"
                                : "No study sessions planned")}
                          </h4>
                          <p>
                            {sessions[0]?.taskDescription ||
                              "Rest, light revision, or preparation for the next study block."}
                          </p>
                        </div>
                      </div>

                      <div className="study-plan-day-stats">
                        <span>{formatDuration(totalMinutes)}</span>
                        <span>{sessions[0]?.courseName || "Free day"}</span>
                      </div>

                      <div className="study-plan-day-details">
                        {sessions.length === 0 ? (
                          <p className="no-study-session">No study sessions planned.</p>
                        ) : (
                          <div className="study-plan-session-list">
                            {sessions.map((session, sessionIndex) => (
                              <div
                                className="study-plan-session-card"
                                key={`${day}-${sessionIndex}`}
                              >
                                <div className="study-plan-session-time">
                                  <Clock size={14} />
                                  <span>
                                    {session.startTime} - {session.endTime}
                                  </span>
                                </div>

                                <div className="study-plan-session-body">
                                  <div>
                                    <h4>{session.taskTitle}</h4>
                                    <p>{session.taskDescription}</p>
                                  </div>

                                  <div className="study-plan-session-tags">
                                    <span>{session.courseName}</span>
                                    <span>{session.activityType}</span>
                                    <span className={`priority-tag ${session.priority}`}>
                                      {session.priority}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>

            {plan?.tips?.length > 0 ? (
              <div className="study-plan-tips">
                <h3>Study Tips</h3>
                <ul>
                  {plan.tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <div className="weekly-header">
            <h2>Weekly Availability</h2>

            {studyPlan ? (
              <button
                type="button"
                className="adjust-availability-btn"
                onClick={() => setShowAvailabilityForm(false)}
              >
                <CalendarDays size={14} />
                View Study Plan
              </button>
            ) : null}
          </div>

          <div className="availability-list">
            {days.map((day) => (
              <div className="availability-row" key={day}>
                <div className="day-name">{day}</div>

                <div className="time-slots">
                  {availability[day].map((slot, index) => (
                    <div className="time-slot" key={`${day}-${index}`}>
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) =>
                          updateTimeSlot(day, index, "start", e.target.value)
                        }
                      />

                      <span>to</span>

                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) =>
                          updateTimeSlot(day, index, "end", e.target.value)
                        }
                      />

                      <button
                        type="button"
                        className="remove-slot"
                        onClick={() => removeTimeSlot(day, index)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="add-slot"
                    onClick={() => addTimeSlot(day)}
                  >
                    <Plus size={13} />
                    Add Time Slot
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="generate-plan-section">
            <button
              className="generate-plan-btn"
              onClick={generatePlan}
              disabled={saving || loading}
            >
              {saving
                ? "Preparing..."
                : studyPlan
                  ? "Update Study Plan"
                  : "Create Study Plan"}
              <Sparkles size={18} />
            </button>

            {message ? (
              <p className="study-plan-message">
                <Clock size={13} />
                {message}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default StudentStudyPlanPage;

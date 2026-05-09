import { Sparkles, Clock, Plus, X, CalendarDays, Pencil } from "lucide-react";
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

function StudentStudyPlanPage() {
  const [availability, setAvailability] = useState(initialAvailability);
  const [studyPlan, setStudyPlan] = useState(null);
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const getStudentId = async () => {
    if (!supabase) {
      alert(supabaseConfigError || "Supabase is not configured.");
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

      const sid = await getStudentId();

      if (!sid) {
        alert("Student profile not found. Please login again.");
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
        alert("Please add at least one available time slot.");
        return;
      }

      const invalidSlot = availabilityRows.find(
        (slot) => slot.start_time >= slot.end_time
      );

      if (invalidSlot) {
        alert(
          `${invalidSlot.day_of_week} has an invalid time slot. Start time must be before end time.`
        );
        return;
      }

      const { error: deleteError } = await supabase
        .from("student_study_availability")
        .delete()
        .eq("sid", sid);

      if (deleteError) {
        console.error(deleteError);
        alert("Failed to update old availability.");
        return;
      }

      const { error: insertError } = await supabase
        .from("student_study_availability")
        .insert(availabilityRows);

      if (insertError) {
        console.error(insertError);
        alert("Failed to save availability.");
        return;
      }

      alert("Availability saved successfully. Now generate the study plan from your backend script.");
      await loadAvailability(sid);
    } catch (error) {
      console.error(error);
      alert("Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const plan = studyPlan?.plan_json;

  return (
    <div className="study-plan-page">
      {(!studyPlan || showAvailabilityForm) && (
  <div className="study-plan-hero">
    <div className="ai-badge">
      <Sparkles size={14} />
      AI-Powered Schedule
    </div>

    <h1>Your Learning Blueprint</h1>
    <p>
      Tell us when you're free, and our adaptive algorithm will craft a
      personalized study plan that matches your energy levels and goals.
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

          <section className="generated-study-plan">
            <div className="study-plan-summary-card">
              <div>
                <span className="study-plan-small-label">
                  <Sparkles size={13} />
                  Weekly Goal
                </span>
                <h3>{plan?.weeklyGoal || "Your personalized weekly study plan"}</h3>
                <p>{plan?.summary || "Follow your generated study schedule for this week."}</p>
              </div>

              <div className="study-plan-hours-card">
                <strong>{plan?.totalStudyHours || 0}</strong>
                <span>Study Hours</span>
              </div>
            </div>

            <div className="study-plan-days-list">
              {days.map((day) => {
                const dayPlan = plan?.days?.find((item) => item.day === day);
                const sessions = dayPlan?.sessions || [];

                return (
                  <div className="study-plan-day-card" key={day}>
                    <div className="study-plan-day-header">
                      <h3>
                        <CalendarDays size={16} />
                        {day}
                      </h3>
                      <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
                    </div>

                    {sessions.length === 0 ? (
                      <p className="no-study-session">No study sessions planned.</p>
                    ) : (
                      <div className="study-plan-session-list">
                        {sessions.map((session, index) => (
                          <div
                            className="study-plan-session-card"
                            key={`${day}-${index}`}
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
                );
              })}
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
              {saving ? "Saving..." : "Save Availability"}
              <Sparkles size={18} />
            </button>

            <p>
              <Clock size={13} />
              After saving availability, generate the study plan from your backend script.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default StudentStudyPlanPage;
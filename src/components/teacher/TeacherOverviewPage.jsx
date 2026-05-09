import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  LineChart,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";

const INSIGHTS_TABLE = "teacher_course_insights";

export default function TeacherOverviewPage({ teacherProfile }) {
  const [insights, setInsights] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const summaryStats = useMemo(() => buildSummaryStats(insights), [insights]);
  const chartData = useMemo(() => buildCourseCompletionData(insights), [insights]);
  const latestReviews = useMemo(
    () => buildLatestReviews(insights, reviews),
    [insights, reviews]
  );
  const reviewSummary = useMemo(() => buildReviewSummary(reviews), [reviews]);

  useEffect(() => {
    let ignore = false;

    async function loadOverviewStats() {
      if (!teacherProfile?.tid || !supabase) {
        setInsights([]);
        setMessage(supabaseConfigError || "Teacher profile was not found.");
        return;
      }

      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from(INSIGHTS_TABLE)
        .select(
          "insight_id, tid, cid, risk_level, insight_json, metrics_json, course(name)"
        )
        .eq("tid", teacherProfile.tid);

      if (ignore) {
        return;
      }

      if (error) {
        setInsights([]);
        setMessage(formatInsightLoadError(error));
        setLoading(false);
        return;
      }

      const mappedInsights = (data || []).map(mapInsightRow);

      setInsights(mappedInsights);

      if (mappedInsights.length > 0) {
        const courseIds = [
          ...new Set(mappedInsights.map((item) => item.cid).filter(Boolean)),
        ];

        const { data: reviewRows, error: reviewError } = await supabase
          .from("review")
          .select("rid, cid, rating, comment, date, time")
          .in("cid", courseIds)
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .limit(5);

        if (!ignore) {
          if (reviewError) {
            console.warn("Latest reviews load failed:", reviewError);
            setReviews([]);
          } else {
            setReviews(reviewRows || []);
          }
        }
      } else {
        setReviews([]);
      }

      setLoading(false);
    }

    void loadOverviewStats();

    return () => {
      ignore = true;
    };
  }, [teacherProfile?.tid]);

  return (
    <main
      className="teacher-overview-page teacher-analytics-page"
      aria-label="Teacher overview"
    >
      <div className="teacher-analytics-header">
        <div>
          <span>
            <Sparkles aria-hidden="true" />
            Overview
          </span>
        </div>
      </div>

      {message ? (
        <div className="teacher-analytics-message" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>{message}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="teacher-analytics-empty">Loading overview...</p>
      ) : (
        <>
          <section className="teacher-analytics-stats" aria-label="Overview stats">
            <OverviewStat
              icon={<Sparkles aria-hidden="true" />}
              label="Insight reports"
              value={String(summaryStats.reportCount)}
            />

            <OverviewStat
              icon={<AlertTriangle aria-hidden="true" />}
              label="High-risk courses"
              value={String(summaryStats.highRiskCount)}
              tone="warm"
            />

            <OverviewStat
              icon={<LineChart aria-hidden="true" />}
              label="Avg progress"
              value={`${summaryStats.averageProgress}%`}
            />

            <OverviewStat
              icon={<Users aria-hidden="true" />}
              label="Students analyzed"
              value={String(summaryStats.studentsAnalyzed)}
              tone="purple"
            />
          </section>

          <section
            className="teacher-overview-card-grid"
            aria-label="Course completion and latest reviews"
          >
            <article
              className="teacher-overview-completion-card"
              aria-label="Course completion chart"
            >
              <div className="teacher-overview-completion-header">
                <h3>Course Completion Trend</h3>

                <div className="teacher-overview-completion-pills">
                  <span>Average Progress</span>
                  <span>All Courses</span>
                </div>
              </div>

              {chartData.length === 0 ? (
                <p className="teacher-analytics-muted">
                  No completion data available yet. Once insights are generated,
                  this chart will show completion rates for each course.
                </p>
              ) : (
                <div className="teacher-overview-chart-wrap">
                  <div className="teacher-overview-y-axis" aria-hidden="true">
                    <span>100%</span>
                    <span>75%</span>
                    <span>50%</span>
                    <span>25%</span>
                    <span>0%</span>
                  </div>

                  <div
                    className="teacher-overview-bar-chart"
                    role="img"
                    aria-label="Course completion percentages"
                  >
                    {chartData.map((item, index) => (
                      <div
                        key={item.id}
                        className="teacher-overview-bar-item"
                        title={`${item.courseName}: ${Math.round(item.completion)}%`}
                      >
                        <div className="teacher-overview-bar-track">
                          <div
                            className="teacher-overview-bar-fill"
                            style={{
                              height: `${Math.max(8, item.completion)}%`,
                            }}
                          >
                            <span className="teacher-overview-bar-dot" />
                          </div>
                        </div>

                        <small>
                          {chartData.length <= 4
                            ? item.courseName
                            : `Course ${index + 1}`}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>

            <aside
  className="teacher-overview-review-card"
  aria-label="Latest reviews"
>
  <div className="teacher-overview-review-card-head">
    <div>
      <p>Latest reviews</p>
    </div>

    <span>{reviewSummary.count} reviews</span>
  </div>

  {latestReviews.length === 0 ? (
    <p className="teacher-overview-empty-review">
      No recent reviews yet. Reviews will appear here once students submit them.
    </p>
  ) : (
    <div className="teacher-overview-review-list">
      {latestReviews.map((review) => (
        <article
          key={review.rid || `${review.cid}-${review.date}-${review.time}`}
          className="teacher-overview-review-item"
        >
          <div className="teacher-overview-review-meta">
            <span className="teacher-overview-review-course">
              {review.courseName}
            </span>

            <span className="teacher-overview-review-rating">
              <span className="teacher-overview-review-stars">
                {Array.from({ length: 5 }, (_, i) =>
                  i < Number(review.rating) ? "★" : "☆"
                ).join("")}
              </span>{" "}
              {Number(review.rating)}/5
            </span>
          </div>

          <p>{review.comment || "No comment provided."}</p>

          <small className="teacher-overview-review-date">
            {review.date || review.time || "Recent"}
          </small>
        </article>
      ))}
    </div>
  )}
</aside>
          </section>
        </>
      )}
    </main>
  );
}

function OverviewStat({ icon, label, value, tone = "green" }) {
  return (
    <article className={`teacher-analytics-stat ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function mapInsightRow(row) {
  const insightJson = normalizeJson(row.insight_json);
  const metricsJson = normalizeJson(row.metrics_json);
  const riskLevel = normalizeRiskLevel(row.risk_level || insightJson.risk_level);

  return {
    id: row.insight_id || row.cid,
    cid: row.cid,
    courseName: row.course?.name || `Course ${row.cid}`,
    riskLevel,
    json: insightJson,
    metrics: metricsJson,
  };
}

function buildCourseCompletionData(insights) {
  return insights
    .map((insight) => ({
      id: insight.id,
      courseName: insight.courseName,
      completion: Math.min(
        100,
        Math.max(
          0,
          Number(insight.metrics.enrollment?.averageProgressPercent || 0)
        )
      ),
    }))
    .sort((a, b) => b.completion - a.completion);
}

function buildLatestReviews(insights, reviews) {
  const courseById = Object.fromEntries(
    insights.map((insight) => [insight.cid, insight.courseName])
  );

  return (reviews || [])
    .slice(0, 4)
    .map((review) => ({
      ...review,
      courseName: courseById[review.cid] || `Course ${review.cid}`,
    }));
}

function buildReviewSummary(reviews) {
  const loaded = reviews || [];
  const count = loaded.length;
  const averageRating =
    count > 0
      ? Number(
          (
            loaded.reduce(
              (sum, item) => sum + Number(item.rating || 0),
              0
            ) / count
          ).toFixed(1)
        )
      : 0;

  return { count, averageRating };
}

function buildSummaryStats(insights) {
  const progressValues = insights.map(
    (insight) => insight.metrics.enrollment?.averageProgressPercent || 0
  );

  return {
    reportCount: insights.length,
    highRiskCount: insights.filter((insight) => insight.riskLevel === "high")
      .length,
    averageProgress: Math.round(average(progressValues)),
    studentsAnalyzed: insights.reduce(
      (total, insight) =>
        total + Number(insight.metrics.enrollment?.enrolledStudents || 0),
      0
    ),
  };
}

function normalizeJson(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeRiskLevel(value) {
  const cleanValue = String(value || "").toLowerCase();

  if (cleanValue.includes("high")) {
    return "high";
  }

  if (cleanValue.includes("low")) {
    return "low";
  }

  return "medium";
}

function average(values) {
  const validValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (validValues.length === 0) {
    return 0;
  }

  return (
    validValues.reduce((total, value) => total + value, 0) / validValues.length
  );
}

function formatInsightLoadError(error) {
  if (error.message?.includes(INSIGHTS_TABLE)) {
    return `Could not load teacher insights. Make sure the ${INSIGHTS_TABLE} table exists.`;
  }

  return `Overview load failed: ${error.message}`;
}
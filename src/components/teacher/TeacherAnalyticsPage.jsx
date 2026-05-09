import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  Clapperboard,
  Clock3,
  LineChart,
  ListChecks,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../../lib/supabase";

const INSIGHTS_TABLE = "teacher_course_insights";

export default function TeacherAnalyticsPage({ teacherProfile }) {
  const [insights, setInsights] = useState([]);
  const [selectedInsightId, setSelectedInsightId] = useState(null);
  const [activeAnalyticsView, setActiveAnalyticsView] = useState("insights");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selectedInsight =
    insights.find((insight) => insight.id === selectedInsightId) || insights[0];
  const summaryStats = useMemo(() => buildSummaryStats(insights), [insights]);

  useEffect(() => {
    let ignore = false;

    async function loadInsights() {
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
          "insight_id, tid, cid, title, summary, risk_level, insight_json, metrics_json, model, generated_at"
        )
        .eq("tid", teacherProfile.tid)
        .order("generated_at", { ascending: false });

      if (ignore) {
        return;
      }

      if (error) {
        setInsights([]);
        setMessage(formatInsightLoadError(error));
        setLoading(false);
        return;
      }

      const courseNamesById = await fetchCourseNames(
        (data || []).map((row) => row.cid).filter(Boolean)
      );

      if (ignore) {
        return;
      }

      const mappedInsights = (data || []).map((row) =>
        mapInsightRow(row, courseNamesById)
      );

      setInsights(mappedInsights);
      setSelectedInsightId(mappedInsights[0]?.id || null);
      setLoading(false);
    }

    void loadInsights();

    return () => {
      ignore = true;
    };
  }, [teacherProfile?.tid]);

  async function refreshInsights() {
    if (!teacherProfile?.tid || !supabase) {
      return;
    }

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from(INSIGHTS_TABLE)
      .select(
        "insight_id, tid, cid, title, summary, risk_level, insight_json, metrics_json, model, generated_at"
      )
      .eq("tid", teacherProfile.tid)
      .order("generated_at", { ascending: false });

    if (error) {
      setMessage(formatInsightLoadError(error));
      setLoading(false);
      return;
    }

    const courseNamesById = await fetchCourseNames(
      (data || []).map((row) => row.cid).filter(Boolean)
    );
    const mappedInsights = (data || []).map((row) =>
      mapInsightRow(row, courseNamesById)
    );

    setInsights(mappedInsights);
    setSelectedInsightId((currentId) =>
      mappedInsights.some((insight) => insight.id === currentId)
        ? currentId
        : mappedInsights[0]?.id || null
    );
    setLoading(false);
  }

  return (
    <main className="teacher-analytics-page" aria-label="Teacher analytics">
      <div className="teacher-analytics-header">
        <div>
          <span>
            <Brain aria-hidden="true" />
            Teacher Insights
          </span>
          {/* <h2>Course Analytics</h2>
          <p>
            Gemini-generated teaching recommendations from watch behavior,
            quiz attempts, and course progress.
          </p> */}
        </div>

        <div className="teacher-analytics-header-actions">
          <div className="teacher-analytics-view-tabs" aria-label="Analytics view">
            <button
              type="button"
              className={
                activeAnalyticsView === "insights" ? "is-active" : ""
              }
              onClick={() => setActiveAnalyticsView("insights")}
            >
              Insights
            </button>
            <button
              type="button"
              className={activeAnalyticsView === "graphs" ? "is-active" : ""}
              onClick={() => setActiveAnalyticsView("graphs")}
            >
              Graphs
            </button>
          </div>

          <button
            type="button"
            className="teacher-analytics-refresh"
            onClick={() => void refreshInsights()}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {message ? (
        <div className="teacher-analytics-message" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>{message}</p>
        </div>
      ) : null}

      {activeAnalyticsView === "insights" ? (
        <section className="teacher-analytics-stats" aria-label="Analytics stats">
          <AnalyticsStat
            icon={<Sparkles aria-hidden="true" />}
            label="Insight reports"
            value={String(summaryStats.reportCount)}
          />
          <AnalyticsStat
            icon={<AlertTriangle aria-hidden="true" />}
            label="High-risk courses"
            value={String(summaryStats.highRiskCount)}
            tone="warm"
          />
          <AnalyticsStat
            icon={<LineChart aria-hidden="true" />}
            label="Avg progress"
            value={`${summaryStats.averageProgress}%`}
          />
          <AnalyticsStat
            icon={<Users aria-hidden="true" />}
            label="Students analyzed"
            value={String(summaryStats.studentsAnalyzed)}
            tone="purple"
          />
        </section>
      ) : null}

      {!loading && !message && insights.length > 0 ? (
        <CourseTagChooser
          insights={insights}
          selectedInsight={selectedInsight}
          onSelectInsight={setSelectedInsightId}
        />
      ) : null}

      {loading ? (
        <p className="teacher-analytics-empty">Loading analytics insights...</p>
      ) : insights.length === 0 ? (
        <AnalyticsEmptyState teacherId={teacherProfile?.tid} />
      ) : activeAnalyticsView === "graphs" ? (
        <GraphsView selectedInsight={selectedInsight} />
      ) : (
        <section className="teacher-analytics-single-view">
          <InsightDetail insight={selectedInsight} />
        </section>
      )}
    </main>
  );
}

function CourseTagChooser({ insights, selectedInsight, onSelectInsight }) {
  return (
    <div className="teacher-analytics-course-tags" aria-label="Course chooser">
      {insights.map((insight) => (
        <button
          key={insight.id}
          type="button"
          className={selectedInsight?.id === insight.id ? "is-active" : ""}
          onClick={() => onSelectInsight(insight.id)}
        >
          <span>{insight.courseName}</span>
          <small className={insight.riskLevel}>{insight.riskLabel}</small>
        </button>
      ))}
    </div>
  );
}

function AnalyticsStat({ icon, label, value, tone = "green" }) {
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

function AnalyticsEmptyState({ teacherId }) {
  return (
    <div className="teacher-analytics-empty-card">
      <Sparkles aria-hidden="true" />
      <h3>No insights generated yet</h3>
      <p>
        Run the teacher insights script after students have watched videos or
        completed quizzes.
      </p>
      <code>npm run teacher:insights -- --teacher={teacherId || "YOUR_TID"}</code>
    </div>
  );
}

function InsightDetail({ insight }) {
  if (!insight) {
    return null;
  }

  const priorityActions = toArray(insight.json.priority_actions);
  const videoInsights = toArray(insight.json.video_insights);
  const quizInsights = toArray(insight.json.quiz_insights);
  const nextExperiments = toArray(insight.json.next_experiments);
  const videos = toArray(insight.metrics.videos);
  const quizzes = toArray(insight.metrics.quizzes);

  return (
    <article className="teacher-analytics-detail">
      <div className="teacher-analytics-detail-heading">
        <div>
          <span className={`teacher-risk-pill ${insight.riskLevel}`}>
            {insight.riskLabel}
          </span>
          <h3>{insight.title}</h3>
          <p>{insight.summary || "No summary was generated for this report."}</p>
        </div>
        <small>
          {insight.model ? `Model: ${insight.model}` : "Model not recorded"}
        </small>
      </div>

      <div className="teacher-analytics-course-metrics">
        <MetricChip
          icon={<Users aria-hidden="true" />}
          label="Enrolled"
          value={String(insight.metrics.enrollment?.enrolledStudents || 0)}
        />
        <MetricChip
          icon={<LineChart aria-hidden="true" />}
          label="Avg progress"
          value={`${Math.round(
            insight.metrics.enrollment?.averageProgressPercent || 0
          )}%`}
        />
        <MetricChip
          icon={<CheckCircle2 aria-hidden="true" />}
          label="Completion"
          value={`${Math.round(
            insight.metrics.enrollment?.completionRatePercent || 0
          )}%`}
        />
      </div>

      <InsightSection
        icon={<Sparkles aria-hidden="true" />}
        title="Priority actions"
        items={priorityActions}
        emptyText="No priority actions were generated."
      />

      <FindingSection
        icon={<Clapperboard aria-hidden="true" />}
        title="Video insights"
        findings={videoInsights}
        emptyText="No video insight was generated yet."
      />

      <FindingSection
        icon={<ListChecks aria-hidden="true" />}
        title="Quiz insights"
        findings={quizInsights}
        emptyText="No quiz insight was generated yet."
      />

      <HotspotSection videos={videos} />

      <QuizMetricSection quizzes={quizzes} />

      <InsightSection
        icon={<BarChart3 aria-hidden="true" />}
        title="Next experiments"
        items={nextExperiments}
        emptyText="No experiments were suggested."
      />
    </article>
  );
}

function GraphsView({ selectedInsight }) {
  const videos = toArray(selectedInsight?.metrics.videos);
  const quizzes = toArray(selectedInsight?.metrics.quizzes);
  const lessons = toArray(selectedInsight?.metrics.lessons);
  const comparisonCharts = buildComparisonCharts({ videos, quizzes, lessons });

  return (
    <section className="teacher-analytics-graphs-only" aria-label="Course graphs">
      <ComparisonChartSection charts={comparisonCharts} />

      {comparisonCharts.length === 0 ? (
        <p className="teacher-analytics-muted">
          No graphable metrics were found for this course yet.
        </p>
      ) : null}
    </section>
  );
}

function ComparisonChartSection({ charts }) {
  if (charts.length === 0) {
    return null;
  }

  return (
    <div className="teacher-analytics-chart-grid">
      {charts.map((chart) => (
        <ComparisonChart key={chart.title} chart={chart} />
      ))}
    </div>
  );
}

function ComparisonChart({ chart }) {
  const plot = {
    left: 54,
    top: 28,
    width: 276,
    height: 144,
  };
  const xTicks = [0, chart.xMax / 2, chart.xMax];
  const yTicks = [0, chart.yMax / 2, chart.yMax];

  return (
    <article className={`teacher-analytics-chart-card ${chart.tone}`}>
      <div className="teacher-analytics-chart-heading">
        <div>
          <strong>{chart.title}</strong>
          <p>{chart.description}</p>
        </div>
        <span>{chart.rows.length} items</span>
      </div>

      <div className="teacher-analytics-chart-legend">
        <span className="primary">X: {chart.xLabel}</span>
        <span className="secondary">Y: {chart.yLabel}</span>
      </div>

      <svg
        className="teacher-analytics-xy-chart"
        viewBox="0 0 380 238"
        role="img"
        aria-label={`${chart.title} X Y graph`}
      >
        {xTicks.map((tick) => {
          const x = plot.left + (tick / chart.xMax) * plot.width;

          return (
            <g key={`x-${tick}`}>
              <line
                x1={x}
                x2={x}
                y1={plot.top}
                y2={plot.top + plot.height}
                className="grid-line"
              />
              <text x={x} y={plot.top + plot.height + 18} textAnchor="middle">
                {formatAxisValue(tick, chart.xUnit)}
              </text>
            </g>
          );
        })}

        {yTicks.map((tick) => {
          const y = plot.top + plot.height - (tick / chart.yMax) * plot.height;

          return (
            <g key={`y-${tick}`}>
              <line
                x1={plot.left}
                x2={plot.left + plot.width}
                y1={y}
                y2={y}
                className="grid-line"
              />
              <text x={plot.left - 10} y={y + 4} textAnchor="end">
                {formatAxisValue(tick, chart.yUnit)}
              </text>
            </g>
          );
        })}

        <line
          x1={plot.left}
          x2={plot.left + plot.width}
          y1={plot.top + plot.height}
          y2={plot.top + plot.height}
          className="axis-line"
        />
        <line
          x1={plot.left}
          x2={plot.left}
          y1={plot.top}
          y2={plot.top + plot.height}
          className="axis-line"
        />

        {chart.rows.map((row, index) => {
          const point = getPointPosition(row, chart, plot);

          return (
            <g key={row.id} className="xy-point">
              <circle cx={point.x} cy={point.y} r="9">
                <title>
                  {row.label}: {chart.xLabel} {row.xDisplay}, {chart.yLabel}{" "}
                  {row.yDisplay}
                </title>
              </circle>
              <text x={point.x} y={point.y + 4} textAnchor="middle">
                {index + 1}
              </text>
            </g>
          );
        })}

        <text
          className="axis-label"
          x={plot.left + plot.width / 2}
          y="226"
          textAnchor="middle"
        >
          {chart.xLabel}
        </text>
        <text
          className="axis-label"
          x="-100"
          y="16"
          textAnchor="middle"
          transform="rotate(-90)"
        >
          {chart.yLabel}
        </text>
      </svg>

      <div className="teacher-analytics-chart-rows">
        {chart.rows.map((row) => (
          <div className="teacher-analytics-chart-row" key={row.id}>
            <div className="teacher-analytics-chart-row-title">
              <span>
                <b>{row.index}</b>
                {row.label}
              </span>
              <small>
                {row.xDisplay} / {row.yDisplay}
              </small>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function MetricChip({ icon, label, value }) {
  return (
    <div>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InsightSection({ icon, title, items, emptyText }) {
  return (
    <section className="teacher-analytics-section">
      <h4>
        {icon}
        {title}
      </h4>
      {items.length > 0 ? (
        <div className="teacher-analytics-action-list">
          {items.map((item, index) => (
            <p key={`${title}-${index}`}>{item}</p>
          ))}
        </div>
      ) : (
        <p className="teacher-analytics-muted">{emptyText}</p>
      )}
    </section>
  );
}

function FindingSection({ icon, title, findings, emptyText }) {
  return (
    <section className="teacher-analytics-section">
      <h4>
        {icon}
        {title}
      </h4>
      {findings.length > 0 ? (
        <div className="teacher-analytics-finding-list">
          {findings.map((finding, index) => (
            <article key={`${title}-${index}`}>
              <strong>
                {finding.video_name || finding.quiz_name || finding.finding}
              </strong>
              {finding.finding ? <p>{finding.finding}</p> : null}
              {finding.evidence ? <small>{finding.evidence}</small> : null}
              {finding.recommendation ? (
                <span>{finding.recommendation}</span>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="teacher-analytics-muted">{emptyText}</p>
      )}
    </section>
  );
}

function HotspotSection({ videos }) {
  const videosWithHotspots = videos.filter(
    (video) =>
      toArray(video.skippedHotspots).length > 0 ||
      toArray(video.rewatchedHotspots).length > 0 ||
      toArray(video.dropOffHotspots).length > 0
  );

  return (
    <section className="teacher-analytics-section">
      <h4>
        <Clock3 aria-hidden="true" />
        Watch behavior hotspots
      </h4>
      {videosWithHotspots.length > 0 ? (
        <div className="teacher-analytics-hotspots">
          {videosWithHotspots.map((video) => (
            <article key={video.vid}>
              <strong>{video.name}</strong>
              <HotspotRow label="Most skipped" values={video.skippedHotspots} />
              <HotspotRow
                label="Most rewatched"
                values={video.rewatchedHotspots}
              />
              <HotspotRow label="Drop-off" values={video.dropOffHotspots} />
            </article>
          ))}
        </div>
      ) : (
        <p className="teacher-analytics-muted">
          No skip, replay, or drop-off hotspots were found.
        </p>
      )}
    </section>
  );
}

function HotspotRow({ label, values }) {
  const hotspots = toArray(values);

  if (hotspots.length === 0) {
    return null;
  }

  return (
    <p>
      <span>{label}</span>
      {hotspots
        .slice(0, 3)
        .map((hotspot) => hotspot.range || `${hotspot.startSecond}s`)
        .join(", ")}
    </p>
  );
}

function QuizMetricSection({ quizzes }) {
  if (quizzes.length === 0) {
    return null;
  }

  return (
    <section className="teacher-analytics-section">
      <h4>
        <ListChecks aria-hidden="true" />
        Quiz performance
      </h4>
      <div className="teacher-analytics-quiz-grid">
        {quizzes.map((quiz) => (
          <article key={quiz.qid}>
            <strong>{quiz.name}</strong>
            <p>Average grade: {Math.round(quiz.averageGradePercent || 0)}%</p>
            <p>Pass rate: {Math.round(quiz.passRatePercent || 0)}%</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function buildComparisonCharts({ videos, quizzes, lessons }) {
  const charts = [];
  const videoRows = buildVideoComparisonRows(videos);
  const quizRows = buildQuizComparisonRows(quizzes);
  const lessonRows = buildLessonComparisonRows(lessons);

  if (videoRows.length > 0) {
    charts.push({
      title: "Completion vs seeking",
      tone: "teal",
      description:
        "Compare watch completion with average seek behavior for each video.",
      xLabel: "Completion",
      yLabel: "Avg seeks",
      xUnit: "%",
      yUnit: "",
      xMax: 100,
      yMax: getChartMax(videoRows.map((row) => row.yValue)),
      rows: videoRows,
    });
  }

  if (quizRows.length > 0) {
    charts.push({
      title: "Grade vs pass rate",
      tone: "purple",
      description:
        "Compare student score quality with the percentage who passed each quiz.",
      xLabel: "Average grade",
      yLabel: "Pass rate",
      xUnit: "%",
      yUnit: "%",
      xMax: 100,
      yMax: 100,
      rows: quizRows,
    });
  }

  if (lessonRows.length > 0) {
    charts.push({
      title: "Video vs quiz outcome",
      tone: "amber",
      description:
        "Compare lesson watch completion with quiz result strength.",
      xLabel: "Video completion",
      yLabel: "Quiz grade",
      xUnit: "%",
      yUnit: "%",
      xMax: 100,
      yMax: 100,
      rows: lessonRows,
    });
  }

  return charts;
}

function buildVideoComparisonRows(videos) {
  const safeVideos = toArray(videos).filter((video) => video.name);

  return safeVideos.slice(0, 6).map((video, index) => {
    const completion = round(video.averageCompletionPercent || 0);
    const seekCount = round(video.averageSeekCount || 0);

    return {
      id: `video-${video.vid}`,
      index: index + 1,
      label: video.name,
      xDisplay: `${completion}%`,
      yDisplay: `${seekCount} seeks`,
      xValue: completion,
      yValue: seekCount,
    };
  });
}

function buildQuizComparisonRows(quizzes) {
  return toArray(quizzes)
    .filter((quiz) => quiz.name)
    .slice(0, 6)
    .map((quiz, index) => {
      const grade = round(quiz.averageGradePercent || 0);
      const passRate = round(quiz.passRatePercent || 0);

      return {
        id: `quiz-${quiz.qid}`,
        index: index + 1,
        label: quiz.name,
        xDisplay: `${grade}%`,
        yDisplay: `${passRate}%`,
        xValue: grade,
        yValue: passRate,
      };
    });
}

function buildLessonComparisonRows(lessons) {
  return toArray(lessons)
    .filter((lesson) => lesson.name)
    .slice(0, 6)
    .map((lesson, index) => {
      const videoCompletion = round(lesson.videoCompletionPercent || 0);
      const quizGrade = round(lesson.quizAverageGradePercent || 0);

      return {
        id: `lesson-${lesson.lid}`,
        index: index + 1,
        label: `Lesson ${lesson.number}: ${lesson.name}`,
        xDisplay: `${videoCompletion}%`,
        yDisplay: `${quizGrade}%`,
        xValue: videoCompletion,
        yValue: quizGrade,
      };
    });
}

async function fetchCourseNames(courseIds) {
  if (!supabase || courseIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("course")
    .select("cid, name")
    .in("cid", courseIds);

  if (error) {
    console.warn("Insight course names load failed:", error.message);
    return {};
  }

  return (data || []).reduce((index, course) => {
    index[String(course.cid)] = course.name;
    return index;
  }, {});
}

function mapInsightRow(row, courseNamesById) {
  const insightJson = normalizeJson(row.insight_json);
  const metricsJson = normalizeJson(row.metrics_json);
  const courseName =
    courseNamesById[String(row.cid)] ||
    metricsJson.course?.name ||
    `Course ${row.cid}`;
  const riskLevel = normalizeRiskLevel(
    row.risk_level || insightJson.risk_level
  );

  return {
    id: row.insight_id || row.cid,
    cid: row.cid,
    title: row.title || insightJson.title || `${courseName} insights`,
    summary: row.summary || insightJson.summary || "",
    riskLevel,
    riskLabel: getRiskLabel(riskLevel),
    courseName,
    json: insightJson,
    metrics: metricsJson,
    model: row.model || "",
    generatedAt: row.generated_at || null,
  };
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

function getRiskLabel(riskLevel) {
  if (riskLevel === "high") {
    return "High risk";
  }

  if (riskLevel === "low") {
    return "Low risk";
  }

  return "Medium risk";
}

function formatInsightLoadError(error) {
  if (error.message?.includes(INSIGHTS_TABLE)) {
    return `Could not load teacher insights. Make sure the ${INSIGHTS_TABLE} table exists.`;
  }

  return `Insights load failed: ${error.message}`;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
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

function getPointPosition(row, chart, plot) {
  const xPercent = clampPercent((Number(row.xValue || 0) / chart.xMax) * 100);
  const yPercent = clampPercent((Number(row.yValue || 0) / chart.yMax) * 100);

  return {
    x: plot.left + (xPercent / 100) * plot.width,
    y: plot.top + plot.height - (yPercent / 100) * plot.height,
  };
}

function getChartMax(values) {
  const validValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const maxValue = validValues.length > 0 ? Math.max(...validValues) : 0;

  return Math.max(1, Math.ceil(maxValue));
}

function formatAxisValue(value, unit) {
  const numberValue = Number(value || 0);
  const cleanValue = Number.isInteger(numberValue)
    ? String(numberValue)
    : String(round(numberValue));

  return `${cleanValue}${unit || ""}`;
}

function clampPercent(value) {
  const numberValue = Number(value || 0);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numberValue));
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

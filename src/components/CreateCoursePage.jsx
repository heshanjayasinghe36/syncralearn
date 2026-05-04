import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  ChevronDown,
  CirclePlus,
  FileText,
  Trash2,
  ListChecks,
  PencilLine,
  TableOfContents,
  Video,
  X,
} from "lucide-react";
import { supabase, supabaseConfigError } from "../lib/supabase";

const lessonContentTypes = [
  { value: "video", label: "Add Video", itemLabel: "Video" },
  { value: "material", label: "Add Materials", itemLabel: "Material" },
  { value: "quiz", label: "Add Quize", itemLabel: "Quize" },
];

const lessonContentConfig = {
  video: {
    table: "video",
    idColumn: "vid",
    select: "vid, name, description, url, lid",
    resourceColumn: "url",
  },
  material: {
    table: "material",
    idColumn: "maid",
    select: "maid, name, file, lid",
    resourceColumn: "file",
  },
  quiz: {
    table: "quize",
    idColumn: "qid",
    select: "qid, name, url, lid",
    resourceColumn: "url",
  },
};

export default function CreateCoursePage({ course, onBack }) {
  const [lessons, setLessons] = useState([]);
  const [lessonName, setLessonName] = useState("");
  const [editingLesson, setEditingLesson] = useState(null);
  const [expandedLessons, setExpandedLessons] = useState({});
  const [lessonContent, setLessonContent] = useState({});
  const [contentDrafts, setContentDrafts] = useState({});
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [publishPricingType, setPublishPricingType] = useState(() =>
    course?.amount === 0 ? "free" : "paid"
  );
  const [publishAmount, setPublishAmount] = useState(() =>
    formatPublishAmount(course?.amount)
  );
  const [publishingCourse, setPublishingCourse] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [message, setMessage] = useState("");
  const [draggingLessonId, setDraggingLessonId] = useState(null);
  const [dragOverLessonId, setDragOverLessonId] = useState(null);
  const courseId = course?.cid || course?.id || null;
  const canReorder = lessons.length >= 2 && !savingOrder;
  const isEditingLesson = Boolean(editingLesson);

  function toggleLessonExpanded(lessonId) {
    setExpandedLessons((currentLessons) => ({
      ...currentLessons,
      [lessonId]: !currentLessons[lessonId],
    }));
  }

  function startContentDraft(lessonId, type) {
    setExpandedLessons((currentLessons) => ({
      ...currentLessons,
      [lessonId]: true,
    }));
    setContentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [lessonId]: { type, title: "", resource: "", description: "" },
    }));
  }

  function updateContentDraft(lessonId, field, value) {
    setContentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [lessonId]: {
        ...(currentDrafts[lessonId] || { type: "video" }),
        [field]: value,
      },
    }));
  }

  function cancelContentDraft(lessonId) {
    setContentDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[lessonId];
      return nextDrafts;
    });
  }

  async function addLessonContent(lessonId) {
    const draft = contentDrafts[lessonId];
    const title = draft?.title?.trim();
    const resource = draft?.resource?.trim();
    const description = draft?.description?.trim();

    if (!draft?.type || !title) {
      setMessage("Content title is required.");
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    const lesson = lessons.find((currentLesson) => currentLesson.id === lessonId);
    const config = lessonContentConfig[draft.type];

    if (!lesson?.databaseId || !config) {
      setMessage("Lesson ID was not found.");
      return;
    }

    const payload = {
      name: title,
      lid: lesson.databaseId,
    };

    if (draft.type === "video") {
      payload.description = description || null;
      payload.url = resource || null;
    } else if (draft.type === "material") {
      payload.file = resource || null;
    } else {
      payload.url = resource || null;
    }

    setSavingContent(true);
    setMessage("");

    const { data, error } = await supabase
      .from(config.table)
      .insert(payload)
      .select(config.select)
      .single();

    if (error) {
      setMessage(`${getContentTypeLabel(draft.type)} add failed: ${error.message}`);
      setSavingContent(false);
      return;
    }

    const contentType = lessonContentTypes.find(
      (type) => type.value === draft.type
    );
    const nextItem = mapLessonContentRow(data, draft.type, contentType?.itemLabel);

    setLessonContent((currentContent) => ({
      ...currentContent,
      [lessonId]: [
        ...(currentContent[lessonId] || []),
        nextItem,
      ],
    }));
    cancelContentDraft(lessonId);
    setSavingContent(false);
    setMessage("");
  }

  useEffect(() => {
    let ignore = false;

    async function loadLessons() {
      if (!courseId || !supabase) {
        setLessons([]);
        return;
      }

      setLoadingLessons(true);
      setMessage("");

      const { data, error } = await supabase
        .from("lesson")
        .select("*")
        .eq("cid", courseId)
        .order("number", { ascending: true })
        .order("lid", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setMessage(`Lessons load failed: ${error.message}`);
        setLessons([]);
        setLessonContent({});
      } else {
        const mappedLessons = (data || []).map(mapLessonRow);
        setLessons(mappedLessons);

        const { content, error: contentError } =
          await loadLessonContent(mappedLessons);

        if (ignore) {
          return;
        }

        if (contentError) {
          setMessage(`Lesson content load failed: ${contentError.message}`);
          setLessonContent({});
        } else {
          setLessonContent(content);
        }
      }

      setLoadingLessons(false);
    }

    loadLessons();

    return () => {
      ignore = true;
    };
  }, [courseId]);

  function handleEditLesson(lesson) {
    setEditingLesson(lesson);
    setLessonName(lesson.name);
    setMessage("");
  }

  function handleCancelLessonEdit() {
    if (savingLesson) {
      return;
    }

    setEditingLesson(null);
    setLessonName("");
    setMessage("");
  }

  async function handleSaveLesson(event) {
    event.preventDefault();

    const name = lessonName.trim();

    if (!name) {
      setMessage("Lesson name is required.");
      return;
    }

    if (!courseId) {
      setMessage("Course ID was not found.");
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    setSavingLesson(true);
    setMessage("");

    if (isEditingLesson) {
      if (!editingLesson?.databaseId) {
        setMessage("Lesson ID was not found.");
        setSavingLesson(false);
        return;
      }

      const { data, error } = await supabase
        .from("lesson")
        .update({ name })
        .eq("lid", editingLesson.databaseId)
        .eq("cid", courseId)
        .select("*")
        .single();

      if (error) {
        setMessage(`Lesson update failed: ${error.message}`);
        setSavingLesson(false);
        return;
      }

      const updatedLesson = mapLessonRow(data);
      setLessons((currentLessons) =>
        currentLessons
          .map((lesson) =>
            lesson.id === updatedLesson.id ? updatedLesson : lesson
          )
          .sort(sortLessonsByNumber)
      );
      setEditingLesson(null);
      setLessonName("");
      setSavingLesson(false);
      return;
    }

    const nextLessonNumber = getNextLessonNumber(lessons);
    const { data, error } = await supabase
      .from("lesson")
      .insert({
        name,
        number: nextLessonNumber,
        cid: courseId,
      })
      .select("*")
      .single();

    if (error) {
      setMessage(`Lesson creation failed: ${error.message}`);
      setSavingLesson(false);
      return;
    }

    setLessons((currentLessons) =>
      [...currentLessons, mapLessonRow(data)].sort(sortLessonsByNumber)
    );
    setLessonName("");
    setSavingLesson(false);
  }

  async function handleLessonDrop(targetLessonId) {
    if (
      !canReorder ||
      !draggingLessonId ||
      draggingLessonId === targetLessonId
    ) {
      setDraggingLessonId(null);
      setDragOverLessonId(null);
      return;
    }

    const fromIndex = lessons.findIndex(
      (lesson) => lesson.id === draggingLessonId
    );
    const toIndex = lessons.findIndex((lesson) => lesson.id === targetLessonId);

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingLessonId(null);
      setDragOverLessonId(null);
      return;
    }

    const previousLessons = lessons;
    const nextLessons = [...lessons];
    const [movedLesson] = nextLessons.splice(fromIndex, 1);
    nextLessons.splice(toIndex, 0, movedLesson);
    const numberedLessons = applyLessonNumbers(nextLessons);

    setLessons(numberedLessons);
    setDraggingLessonId(null);
    setDragOverLessonId(null);
    await saveLessonOrder(numberedLessons, previousLessons);
  }

  async function saveLessonOrder(nextLessons, previousLessons) {
    if (!supabase || !courseId) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      setLessons(previousLessons);
      return;
    }

    setSavingOrder(true);
    setMessage("");

    const updates = nextLessons.map((lesson, index) =>
      supabase
        .from("lesson")
        .update({ number: index + 1 })
        .eq("lid", lesson.databaseId)
        .eq("cid", courseId)
    );

    const results = await Promise.all(updates);
    const failedUpdate = results.find((result) => result.error);

    if (failedUpdate?.error) {
      setLessons(previousLessons);
      setMessage(`Lesson order update failed: ${failedUpdate.error.message}`);
    } else {
      setLessons(applyLessonNumbers(nextLessons));
    }

    setSavingOrder(false);
  }

  async function handleDeleteLesson(lesson) {
    if (!lesson?.databaseId) {
      setMessage("Lesson ID was not found.");
      return;
    }

    if (!supabase || !courseId) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${lesson.name}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setMessage("");

    const { error } = await supabase
      .from("lesson")
      .delete()
      .eq("lid", lesson.databaseId)
      .eq("cid", courseId);

    if (error) {
      setMessage(`Lesson delete failed: ${error.message}`);
      return;
    }

    const previousLessons = lessons;
    const nextLessons = applyLessonNumbers(
      lessons.filter((currentLesson) => currentLesson.id !== lesson.id)
    );

    setLessons(nextLessons);

    if (editingLesson?.id === lesson.id) {
      setEditingLesson(null);
      setLessonName("");
    }

    await saveLessonOrder(nextLessons, previousLessons);
  }

  async function handlePublishCourse(event) {
    event.preventDefault();

    if (!courseId) {
      setPublishMessage("Course ID was not found.");
      return;
    }

    if (!supabase) {
      setPublishMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    const cleanAmount = String(publishAmount).trim();
    const isFreeCourse = publishPricingType === "free";
    const numericAmount = isFreeCourse ? 0 : Number(cleanAmount);

    if (
      (!isFreeCourse && !cleanAmount) ||
      (!isFreeCourse && (!Number.isFinite(numericAmount) || numericAmount < 0))
    ) {
      setPublishMessage("Enter a valid course amount or choose Free.");
      return;
    }

    setPublishingCourse(true);
    setPublishMessage("");

    const { error } = await supabase
      .from("course")
      .update({
        amount: numericAmount,
        status: "active",
      })
      .eq("cid", courseId);

    if (error) {
      setPublishMessage(`Course publish failed: ${error.message}`);
      setPublishingCourse(false);
      return;
    }

    setPublishingCourse(false);
    setPublishMessage("Course published successfully.");
  }

  function handlePublishPricingChange(event) {
    const nextPricingType = event.target.value;

    setPublishPricingType(nextPricingType);
    setPublishMessage("");

    if (nextPricingType === "free") {
      setPublishAmount("0.00");
    }
  }

  function handlePublishAmountBlur() {
    if (publishPricingType === "free") {
      setPublishAmount("0.00");
      return;
    }

    const numericAmount = Number(String(publishAmount).trim());

    if (Number.isFinite(numericAmount) && numericAmount >= 0) {
      setPublishAmount(numericAmount.toFixed(2));
    }
  }

  return (
    <main className="teacher-create-course-page" aria-label="Create course">
      <div className="teacher-create-course-header">
        <button type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          <span>My Courses</span>
        </button>

        <div>
          <p>Course Builder</p>
          <h2>{course?.title || course?.name || "New Course"}</h2>
        </div>
      </div>

      <section className="teacher-builder-card">
        <div className="teacher-builder-intro">
          <span>
            <BookOpenText aria-hidden="true" />
          </span>
          <div>
            <h3>Create lessons</h3>
            <p>
              Add lesson names first. Reorder lessons by dragging the table icon
              at the end of each row.
            </p>
          </div>
        </div>

        <form className="teacher-lesson-form" onSubmit={handleSaveLesson}>
          <label>
            <span>{isEditingLesson ? "Editing lesson" : "Lesson name"}</span>
            <input
              type="text"
              value={lessonName}
              onChange={(event) => setLessonName(event.target.value)}
              placeholder="e.g. Introduction to the topic"
              disabled={savingLesson}
            />
          </label>

          <div className="teacher-lesson-form-actions">
            <button type="submit" disabled={savingLesson}>
              {isEditingLesson ? (
                <PencilLine aria-hidden="true" />
              ) : (
                <CirclePlus aria-hidden="true" />
              )}
              <span>
                {savingLesson
                  ? isEditingLesson
                    ? "Updating..."
                    : "Adding..."
                  : isEditingLesson
                    ? "Update Lesson"
                    : "Add Lesson"}
              </span>
            </button>

            {isEditingLesson ? (
              <button
                type="button"
                className="teacher-lesson-cancel-button"
                onClick={handleCancelLessonEdit}
                disabled={savingLesson}
              >
                <X aria-hidden="true" />
                <span>Cancel</span>
              </button>
            ) : null}
          </div>
        </form>

        {message ? <p className="teacher-builder-message">{message}</p> : null}

        <div className="teacher-lesson-list" aria-label="Lesson list">
          <div className="teacher-lesson-list-title">
            <ListChecks aria-hidden="true" />
            <span>
              {lessons.length} Lessons{savingOrder ? " - Saving order..." : ""}
            </span>
          </div>

          {loadingLessons ? (
            <p className="teacher-lesson-empty">Loading lessons...</p>
          ) : lessons.length > 0 ? (
            lessons.map((lesson, index) => (
              <article
                key={lesson.id}
                className={`teacher-lesson-row ${
                  dragOverLessonId === lesson.id ? "is-drag-over" : ""
                } ${expandedLessons[lesson.id] ? "is-expanded" : ""}`}
                onDragOver={(event) => {
                  if (!canReorder || !draggingLessonId) {
                    return;
                  }

                  event.preventDefault();
                  setDragOverLessonId(lesson.id);
                }}
                onDrop={() => void handleLessonDrop(lesson.id)}
              >
                <span className="teacher-lesson-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h4>{lesson.name}</h4>
                </div>

                <div className="teacher-lesson-row-actions">
                  <button
                    type="button"
                    className="teacher-lesson-expand-button"
                    onClick={() => toggleLessonExpanded(lesson.id)}
                    aria-expanded={Boolean(expandedLessons[lesson.id])}
                    aria-label={`Expand ${lesson.name}`}
                  >
                    <ChevronDown aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="teacher-lesson-edit-button"
                    onClick={() => handleEditLesson(lesson)}
                    disabled={savingLesson || savingOrder}
                    aria-label={`Edit ${lesson.name}`}
                  >
                    <PencilLine aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="teacher-lesson-delete-button"
                    onClick={() => void handleDeleteLesson(lesson)}
                    disabled={savingLesson || savingOrder}
                    aria-label={`Delete ${lesson.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>

                  {canReorder ? (
                    <button
                      type="button"
                      className="teacher-lesson-drag-handle"
                      draggable
                      disabled={savingOrder}
                      aria-label={`Move ${lesson.name}`}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingLessonId(lesson.id);
                      }}
                      onDragEnd={() => {
                        setDraggingLessonId(null);
                        setDragOverLessonId(null);
                      }}
                    >
                      <TableOfContents aria-hidden="true" />
                    </button>
                  ) : null}
                </div>

                {expandedLessons[lesson.id] ? (
                  <LessonContentPanel
                    draft={contentDrafts[lesson.id]}
                    items={lessonContent[lesson.id] || []}
                    lessonId={lesson.id}
                    onAdd={startContentDraft}
                    onCancelDraft={cancelContentDraft}
                    onSaveDraft={addLessonContent}
                    onUpdateDraft={updateContentDraft}
                    saving={savingContent}
                  />
                ) : null}
              </article>
            ))
          ) : (
            <p className="teacher-lesson-empty">
              No lessons yet. Add your first lesson name above.
            </p>
          )}
        </div>
      </section>

      <section className="teacher-publish-card" aria-label="Publish course">
        <div>
          <p>Ready to publish</p>
          <h3>Set course amount</h3>
        </div>

        <form onSubmit={handlePublishCourse}>
          <label className="teacher-publish-type-label" aria-label="Pricing type">
            <div className="teacher-publish-select-wrap">
              <select
                value={publishPricingType}
                onChange={handlePublishPricingChange}
                disabled={publishingCourse}
                aria-label="Pricing type"
              >
                <option value="paid">Paid</option>
                <option value="free">Free</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
          </label>

          <label aria-label="Course amount">
            <div
              className={`teacher-publish-amount-control ${
                publishPricingType === "free" ? "is-free" : ""
              }`}
            >
              <input
                type="text"
                inputMode="decimal"
                value={publishAmount}
                onChange={(event) => setPublishAmount(event.target.value)}
                onBlur={handlePublishAmountBlur}
                placeholder="0.00"
                disabled={publishingCourse || publishPricingType === "free"}
                aria-label="Course amount"
              />
              <span className="teacher-publish-currency">LKR</span>
            </div>
          </label>
          <button type="submit" disabled={publishingCourse}>
            {publishingCourse ? "Publishing..." : "Publish"}
          </button>
        </form>

        {publishMessage ? (
          <p className="teacher-publish-message">{publishMessage}</p>
        ) : null}
      </section>
    </main>
  );
}

function LessonContentPanel({
  draft,
  items,
  lessonId,
  onAdd,
  onCancelDraft,
  onSaveDraft,
  onUpdateDraft,
  saving,
}) {
  const draftType = lessonContentTypes.find(
    (contentType) => contentType.value === draft?.type
  );
  const [previewItemId, setPreviewItemId] = useState(null);

  return (
    <section className="teacher-lesson-content-panel">
      <div className="teacher-lesson-content-actions">
        {lessonContentTypes.map((contentType) => (
          <button
            key={contentType.value}
            type="button"
            onClick={() => onAdd(lessonId, contentType.value)}
          >
            <ContentTypeIcon type={contentType.value} />
            <span>{contentType.label}</span>
          </button>
        ))}
      </div>

      {draft ? (
        <form
          className={`teacher-lesson-content-form ${
            draft.type === "video" ? "is-video" : ""
          }`}
          onSubmit={(event) => {
            event.preventDefault();
            onSaveDraft(lessonId);
          }}
        >
          <input
            type="text"
            value={draft.title}
            onChange={(event) =>
              onUpdateDraft(lessonId, "title", event.target.value)
            }
            placeholder={`${draftType?.itemLabel || "Content"} name`}
            disabled={saving}
            autoFocus
          />
          <input
            type="text"
            value={draft.resource}
            onChange={(event) =>
              onUpdateDraft(lessonId, "resource", event.target.value)
            }
            placeholder={draft.type === "material" ? "File URL or path" : "URL"}
            disabled={saving}
          />
          {draft.type === "video" ? (
            <input
              type="text"
              value={draft.description}
              onChange={(event) =>
                onUpdateDraft(lessonId, "description", event.target.value)
              }
              placeholder="Description optional"
              disabled={saving}
            />
          ) : null}
          <button type="submit" disabled={saving}>
            {saving ? "Adding..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => onCancelDraft(lessonId)}
            disabled={saving}
          >
            Cancel
          </button>
        </form>
      ) : null}

      <div className="teacher-lesson-content-rows">
        {items.length > 0 ? (
          items.map((item) => (
            <article key={item.id} className="teacher-lesson-content-row">
              <span>
                <ContentTypeIcon type={item.type} />
              </span>
              <div>
                <p>
                  {item.label}
                  {item.resource ? ` - ${item.resource}` : ""}
                </p>
                <h5>{item.title}</h5>
                {item.description ? <small>{item.description}</small> : null}
              </div>
              {item.type === "video" && item.resource ? (
                <button
                  type="button"
                  className="teacher-video-preview-button"
                  onClick={() =>
                    setPreviewItemId((currentItemId) =>
                      currentItemId === item.id ? null : item.id
                    )
                  }
                >
                  {previewItemId === item.id ? "Hide preview" : "Preview"}
                </button>
              ) : null}
              {item.type === "video" && previewItemId === item.id ? (
                <VideoPreview url={item.resource} title={item.title} />
              ) : null}
            </article>
          ))
        ) : (
          <p className="teacher-lesson-content-empty">
            No content added to this lesson yet.
          </p>
        )}
      </div>
    </section>
  );
}

function VideoPreview({ url, title }) {
  const preview = getVideoPreview(url);

  if (!preview) {
    return (
      <div className="teacher-video-preview-fallback">
        <p>This video URL cannot be embedded here.</p>
        <a href={url} target="_blank" rel="noreferrer">
          Open video
        </a>
      </div>
    );
  }

  if (preview.type === "iframe") {
    return (
      <div className="teacher-video-preview">
        <iframe
          src={preview.src}
          title={`${title} preview`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="teacher-video-preview">
      <video controls src={preview.src}>
        <track kind="captions" />
      </video>
    </div>
  );
}

function ContentTypeIcon({ type }) {
  if (type === "video") {
    return <Video aria-hidden="true" />;
  }

  if (type === "material") {
    return <FileText aria-hidden="true" />;
  }

  return <ListChecks aria-hidden="true" />;
}

async function loadLessonContent(lessons) {
  const lessonIds = lessons
    .map((lesson) => lesson.databaseId)
    .filter(Boolean);

  if (lessonIds.length === 0) {
    return { content: {}, error: null };
  }

  const [videoResult, materialResult, quizResult] = await Promise.all([
    supabase
      .from(lessonContentConfig.video.table)
      .select(lessonContentConfig.video.select)
      .in("lid", lessonIds),
    supabase
      .from(lessonContentConfig.material.table)
      .select(lessonContentConfig.material.select)
      .in("lid", lessonIds),
    supabase
      .from(lessonContentConfig.quiz.table)
      .select(lessonContentConfig.quiz.select)
      .in("lid", lessonIds),
  ]);

  const failedResult = [videoResult, materialResult, quizResult].find(
    (result) => result.error
  );

  if (failedResult?.error) {
    return { content: {}, error: failedResult.error };
  }

  const lessonIdByDatabaseId = lessons.reduce((index, lesson) => {
    index[String(lesson.databaseId)] = lesson.id;
    return index;
  }, {});
  const content = {};

  lessons.forEach((lesson) => {
    content[lesson.id] = [];
  });

  [
    ["video", videoResult.data || []],
    ["material", materialResult.data || []],
    ["quiz", quizResult.data || []],
  ].forEach(([type, rows]) => {
    const contentType = lessonContentTypes.find(
      (item) => item.value === type
    );

    rows.forEach((row) => {
      const lessonId = lessonIdByDatabaseId[String(row.lid)];

      if (!lessonId) {
        return;
      }

      content[lessonId].push(
        mapLessonContentRow(row, type, contentType?.itemLabel)
      );
    });
  });

  return { content, error: null };
}

function mapLessonContentRow(row, type, fallbackLabel = "Item") {
  const config = lessonContentConfig[type];
  const idValue = row?.[config.idColumn];
  const resourceValue = row?.[config.resourceColumn] || "";

  return {
    id: `${type}-${idValue || row?.name}`,
    databaseId: idValue || null,
    type,
    label: fallbackLabel,
    title: row?.name || "Untitled",
    resource: resourceValue,
    description: row?.description || "",
    raw: row,
  };
}

function getContentTypeLabel(type) {
  return (
    lessonContentTypes.find((contentType) => contentType.value === type)
      ?.itemLabel || "Content"
  );
}

function getVideoPreview(url) {
  const cleanUrl = url?.trim();

  if (!cleanUrl) {
    return null;
  }

  const youtubeUrl = getYouTubeEmbedUrl(cleanUrl);

  if (youtubeUrl) {
    return { type: "iframe", src: youtubeUrl };
  }

  if (isDirectVideoUrl(cleanUrl)) {
    return { type: "video", src: cleanUrl };
  }

  return null;
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const videoId = parsedUrl.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com"
    ) {
      const videoId = parsedUrl.searchParams.get("v");

      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }

      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      const embedIndex = pathParts.findIndex((part) => part === "embed");
      const shortsIndex = pathParts.findIndex((part) => part === "shorts");

      if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
        return `https://www.youtube.com/embed/${pathParts[embedIndex + 1]}`;
      }

      if (shortsIndex >= 0 && pathParts[shortsIndex + 1]) {
        return `https://www.youtube.com/embed/${pathParts[shortsIndex + 1]}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

function formatPublishAmount(amount) {
  if (amount === null || amount === undefined || amount === "") {
    return "0.00";
  }

  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount) && numericAmount >= 0
    ? numericAmount.toFixed(2)
    : "0.00";
}

function mapLessonRow(row) {
  return {
    id: row?.lid || row?.id || row?.lesson_id || row?.name,
    databaseId: row?.lid || row?.id || row?.lesson_id || null,
    name: row?.name || row?.lesson_name || row?.title || "Untitled Lesson",
    number: Number(row?.number) || 0,
    summary: row?.summary || null,
    raw: row,
  };
}

function sortLessonsByNumber(firstLesson, secondLesson) {
  return firstLesson.number - secondLesson.number;
}

function getNextLessonNumber(lessons) {
  if (lessons.length === 0) {
    return 1;
  }

  return Math.max(...lessons.map((lesson) => lesson.number || 0)) + 1;
}

function applyLessonNumbers(lessons) {
  return lessons.map((lesson, index) => ({
    ...lesson,
    number: index + 1,
  }));
}

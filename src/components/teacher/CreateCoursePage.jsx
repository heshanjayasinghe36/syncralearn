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
import { supabase, supabaseConfigError } from "../../lib/supabase";

const MATERIALS_BUCKET = "materials";

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
    select: "qid, name, lid, pass_threshold",
  },
};

export default function CreateCoursePage({ course, onBack }) {
  const [lessons, setLessons] = useState([]);
  const [lessonName, setLessonName] = useState("");
  const [editingLesson, setEditingLesson] = useState(null);
  const [expandedLessons, setExpandedLessons] = useState({});
  const [lessonContent, setLessonContent] = useState({});
  const [contentDrafts, setContentDrafts] = useState({});
  const [quizBuilder, setQuizBuilder] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [introVideoUrl, setIntroVideoUrl] = useState(
    () => course?.intro_vid_url || course?.introVideoUrl || ""
  );
  const [courseDescription, setCourseDescription] = useState(
    () => course?.description || ""
  );
  const [savingIntroVideo, setSavingIntroVideo] = useState(false);
  const [showIntroVideoPreview, setShowIntroVideoPreview] = useState(false);
  const [introVideoMessage, setIntroVideoMessage] = useState("");
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

  useEffect(() => {
    let ignore = false;

    async function loadCoursePreviewDetails() {
      const passedIntroUrl = course?.intro_vid_url || course?.introVideoUrl;

      if (passedIntroUrl) {
        setIntroVideoUrl(passedIntroUrl);
      } else {
        setIntroVideoUrl("");
      }

      setCourseDescription(course?.description || "");

      if (!courseId || !supabase) {
        return;
      }

      const { data, error } = await supabase
        .from("course")
        .select("intro_vid_url, description")
        .eq("cid", courseId)
        .maybeSingle();

      if (ignore) {
        return;
      }

      if (!error) {
        setIntroVideoUrl(data?.intro_vid_url || "");
        setCourseDescription(data?.description || "");
      }
    }

    void loadCoursePreviewDetails();

    return () => {
      ignore = true;
    };
  }, [course?.description, course?.intro_vid_url, course?.introVideoUrl, courseId]);

  async function handleSaveIntroVideo(event) {
    event.preventDefault();

    if (!courseId) {
      setIntroVideoMessage("Course ID was not found.");
      return;
    }

    if (!supabase) {
      setIntroVideoMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    const cleanIntroVideoUrl = introVideoUrl.trim();
    const cleanDescription = courseDescription.trim();

    setSavingIntroVideo(true);
    setIntroVideoMessage("");

    const { error } = await supabase
      .from("course")
      .update({
        intro_vid_url: cleanIntroVideoUrl || null,
        description: cleanDescription || null,
      })
      .eq("cid", courseId);

    if (error) {
      setIntroVideoMessage(`Introduction video save failed: ${error.message}`);
      setSavingIntroVideo(false);
      return;
    }

    setIntroVideoUrl(cleanIntroVideoUrl);
    setCourseDescription(cleanDescription);
    setIntroVideoMessage(
      cleanIntroVideoUrl || cleanDescription
        ? "Course preview details saved."
        : "Course preview details cleared."
    );
    setSavingIntroVideo(false);
  }

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

    if (type === "quiz") {
      const lesson = lessons.find((currentLesson) => currentLesson.id === lessonId);

      setContentDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[lessonId];
        return nextDrafts;
      });
      setQuizBuilder({
        mode: "create",
        lessonId,
        title: lesson?.name ? `${lesson.name} Quiz` : "",
        passThreshold: "70",
        questions: [createQuizQuestion()],
        message: "",
      });
      return;
    }

    setContentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [lessonId]: {
        type,
        title: "",
        resource: "",
        description: "",
        file: null,
      },
    }));
  }

  async function editQuizContent(lessonId, item) {
    if (!item?.databaseId) {
      setMessage("Quiz ID was not found.");
      return;
    }

    if (!supabase) {
      setMessage(supabaseConfigError || "Supabase is not configured.");
      return;
    }

    setSavingQuiz(true);
    setMessage("Loading quiz builder...");

    const { data, error } = await supabase
      .from("quize_questions")
      .select(
        "qqid, question, type, quize_options(oid, option_text, is_correct)"
      )
      .eq("qid", item.databaseId)
      .order("qqid", { ascending: true });

    if (error) {
      setMessage(`Quiz load failed: ${error.message}`);
      setSavingQuiz(false);
      return;
    }

    setQuizBuilder({
      mode: "edit",
      quizId: item.databaseId,
      lessonId,
      title: item.title || "",
      passThreshold:
        item.passThreshold === null || item.passThreshold === undefined
          ? ""
          : String(item.passThreshold),
      questions:
        data?.length > 0
          ? data.map(mapQuizQuestionToBuilder)
          : [createQuizQuestion()],
      message: "",
    });
    setSavingQuiz(false);
    setMessage("");
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

  function closeQuizBuilder() {
    if (savingQuiz) {
      return;
    }

    setQuizBuilder(null);
  }

  function updateQuizBuilderField(field, value) {
    setQuizBuilder((currentBuilder) =>
      currentBuilder
        ? {
            ...currentBuilder,
            [field]: value,
            message: "",
          }
        : currentBuilder
    );
  }

  function updateQuizQuestion(questionId, field, value) {
    setQuizBuilder((currentBuilder) =>
      currentBuilder
        ? {
            ...currentBuilder,
            message: "",
            questions: currentBuilder.questions.map((question) =>
              question.id === questionId
                ? {
                    ...question,
                    [field]: value,
                  }
                : question
            ),
          }
        : currentBuilder
    );
  }

  function updateQuizOption(questionId, optionId, value) {
    setQuizBuilder((currentBuilder) =>
      currentBuilder
        ? {
            ...currentBuilder,
            message: "",
            questions: currentBuilder.questions.map((question) =>
              question.id === questionId
                ? {
                    ...question,
                    options: question.options.map((option) =>
                      option.id === optionId
                        ? {
                            ...option,
                            text: value,
                          }
                        : option
                    ),
                  }
                : question
            ),
          }
        : currentBuilder
    );
  }

  function setCorrectQuizOption(questionId, optionId) {
    setQuizBuilder((currentBuilder) =>
      currentBuilder
        ? {
            ...currentBuilder,
            message: "",
            questions: currentBuilder.questions.map((question) =>
              question.id === questionId
                ? {
                    ...question,
                    options: question.options.map((option) => ({
                      ...option,
                      isCorrect: option.id === optionId,
                    })),
                  }
                : question
            ),
          }
        : currentBuilder
    );
  }

  function addQuizQuestion() {
    setQuizBuilder((currentBuilder) =>
      currentBuilder
        ? {
            ...currentBuilder,
            message: "",
            questions: [...currentBuilder.questions, createQuizQuestion()],
          }
        : currentBuilder
    );
  }

  function removeQuizQuestion(questionId) {
    setQuizBuilder((currentBuilder) => {
      if (!currentBuilder) {
        return currentBuilder;
      }

      if (currentBuilder.questions.length <= 1) {
        return {
          ...currentBuilder,
          message: "At least one question is required.",
        };
      }

      return {
        ...currentBuilder,
        message: "",
        questions: currentBuilder.questions.filter(
          (question) => question.id !== questionId
        ),
      };
    });
  }

  function addQuizOption(questionId) {
    setQuizBuilder((currentBuilder) =>
      currentBuilder
        ? {
            ...currentBuilder,
            message: "",
            questions: currentBuilder.questions.map((question) =>
              question.id === questionId
                ? {
                    ...question,
                    options: [...question.options, createQuizOption(false)],
                  }
                : question
            ),
          }
        : currentBuilder
    );
  }

  function removeQuizOption(questionId, optionId) {
    setQuizBuilder((currentBuilder) => {
      if (!currentBuilder) {
        return currentBuilder;
      }

      return {
        ...currentBuilder,
        message: "",
        questions: currentBuilder.questions.map((question) => {
          if (question.id !== questionId) {
            return question;
          }

          if (question.options.length <= 2) {
            return question;
          }

          const nextOptions = question.options.filter(
            (option) => option.id !== optionId
          );
          const hasCorrectOption = nextOptions.some((option) => option.isCorrect);

          return {
            ...question,
            options: hasCorrectOption
              ? nextOptions
              : nextOptions.map((option, index) => ({
                  ...option,
                  isCorrect: index === 0,
                })),
          };
        }),
      };
    });
  }

  async function saveQuizBuilder(event) {
    event.preventDefault();

    if (!quizBuilder) {
      return;
    }

    if (!supabase) {
      setQuizBuilder((currentBuilder) =>
        currentBuilder
          ? {
              ...currentBuilder,
              message: supabaseConfigError || "Supabase is not configured.",
            }
          : currentBuilder
      );
      return;
    }

    const lesson = lessons.find(
      (currentLesson) => currentLesson.id === quizBuilder.lessonId
    );

    if (!lesson?.databaseId) {
      setQuizBuilder((currentBuilder) =>
        currentBuilder
          ? {
              ...currentBuilder,
              message: "Lesson ID was not found.",
            }
          : currentBuilder
      );
      return;
    }

    const cleanQuiz = normalizeQuizBuilder(quizBuilder);

    if (cleanQuiz.error) {
      setQuizBuilder((currentBuilder) =>
        currentBuilder
          ? {
              ...currentBuilder,
              message: cleanQuiz.error,
            }
          : currentBuilder
      );
      return;
    }

    setSavingQuiz(true);
    setQuizBuilder((currentBuilder) =>
      currentBuilder
        ? {
            ...currentBuilder,
            message: "",
          }
        : currentBuilder
    );

    if (quizBuilder.mode === "edit" && quizBuilder.quizId) {
      const { data: quizRow, error: quizError } = await supabase
        .from("quize")
        .update({
          name: cleanQuiz.title,
          pass_threshold: cleanQuiz.passThreshold,
        })
        .eq("qid", quizBuilder.quizId)
        .select(lessonContentConfig.quiz.select)
        .single();

      if (quizError) {
        setQuizBuilder((currentBuilder) =>
          currentBuilder
            ? {
                ...currentBuilder,
                message: `Quiz update failed: ${quizError.message}`,
              }
            : currentBuilder
        );
        setSavingQuiz(false);
        return;
      }

      const { error: deleteQuestionsError } = await supabase
        .from("quize_questions")
        .delete()
        .eq("qid", quizBuilder.quizId);

      if (deleteQuestionsError) {
        setQuizBuilder((currentBuilder) =>
          currentBuilder
            ? {
                ...currentBuilder,
                message: `Old questions cleanup failed: ${deleteQuestionsError.message}`,
              }
            : currentBuilder
        );
        setSavingQuiz(false);
        return;
      }

      const questionSaveError = await saveQuizQuestions(
        quizBuilder.quizId,
        cleanQuiz.questions
      );

      if (questionSaveError) {
        setQuizBuilder((currentBuilder) =>
          currentBuilder
            ? {
                ...currentBuilder,
                message: questionSaveError,
              }
            : currentBuilder
        );
        setSavingQuiz(false);
        return;
      }

      const nextItem = mapLessonContentRow(
        quizRow,
        "quiz",
        getContentTypeLabel("quiz")
      );

      setLessonContent((currentContent) => ({
        ...currentContent,
        [quizBuilder.lessonId]: (currentContent[quizBuilder.lessonId] || []).map(
          (contentItem) =>
            contentItem.type === "quiz" &&
            contentItem.databaseId === quizBuilder.quizId
              ? nextItem
              : contentItem
        ),
      }));
      setQuizBuilder(null);
      setSavingQuiz(false);
      setMessage("");
      return;
    }

    const { data: quizRow, error: quizError } = await supabase
      .from("quize")
      .insert({
        name: cleanQuiz.title,
        lid: lesson.databaseId,
        pass_threshold: cleanQuiz.passThreshold,
      })
      .select(lessonContentConfig.quiz.select)
      .single();

    if (quizError) {
      setQuizBuilder((currentBuilder) =>
        currentBuilder
          ? {
              ...currentBuilder,
              message: `Quiz creation failed: ${quizError.message}`,
            }
          : currentBuilder
      );
      setSavingQuiz(false);
      return;
    }

    const questionSaveError = await saveQuizQuestions(
      quizRow.qid,
      cleanQuiz.questions
    );

    if (questionSaveError) {
      await deleteQuizDraft(quizRow.qid);
      setQuizBuilder((currentBuilder) =>
        currentBuilder
          ? {
              ...currentBuilder,
              message: questionSaveError,
            }
          : currentBuilder
      );
      setSavingQuiz(false);
      return;
    }

    const nextItem = mapLessonContentRow(
      quizRow,
      "quiz",
      getContentTypeLabel("quiz")
    );

    setLessonContent((currentContent) => ({
      ...currentContent,
      [quizBuilder.lessonId]: [
        ...(currentContent[quizBuilder.lessonId] || []),
        nextItem,
      ],
    }));
    setQuizBuilder(null);
    setSavingQuiz(false);
    setMessage("");
  }

  async function addLessonContent(lessonId) {
    const draft = contentDrafts[lessonId];
    const title = draft?.title?.trim();
    const resource = draft?.resource?.trim();
    const description = draft?.description?.trim();
    const materialFile = draft?.file || null;

    if (!draft?.type || !title) {
      setMessage("Content title is required.");
      return;
    }

    if (draft.type === "material" && !materialFile) {
      setMessage("Choose a PDF file for the material.");
      return;
    }

    if (draft.type === "material" && !isPdfFile(materialFile)) {
      setMessage("Only PDF material files are supported.");
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

    setSavingContent(true);
    setMessage("");

    let materialFileUrl = resource || null;

    if (draft.type === "material") {
      const safeFileName = materialFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${courseId}/${lesson.databaseId}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(MATERIALS_BUCKET)
        .upload(filePath, materialFile, {
          cacheControl: "3600",
          contentType: materialFile.type || "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        setMessage(`Material upload failed: ${uploadError.message}`);
        setSavingContent(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from(MATERIALS_BUCKET)
        .getPublicUrl(filePath);

      materialFileUrl = publicData.publicUrl || filePath;
    }

    const payload = {
      name: title,
      lid: lesson.databaseId,
    };

    if (draft.type === "video") {
      payload.description = description || null;
      payload.url = resource || null;
    } else if (draft.type === "material") {
      payload.file = materialFileUrl;
    }

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

      <section
        className="teacher-intro-video-card"
        aria-label="Introduction video"
      >
        <div className="teacher-builder-intro">
          <span>
            <Video aria-hidden="true" />
          </span>
          <div>
            <h3>Introduction video</h3>
            <p>
              Add a preview video students can watch before purchasing this
              course.
            </p>
          </div>
        </div>

        <form className="teacher-intro-video-form" onSubmit={handleSaveIntroVideo}>
          <label>
            <span>Video URL</span>
            <input
              type="url"
              value={introVideoUrl}
              onChange={(event) => {
                setIntroVideoUrl(event.target.value);
                setShowIntroVideoPreview(false);
                setIntroVideoMessage("");
              }}
              placeholder="https://youtube.com/watch?v=..."
              disabled={savingIntroVideo}
            />
          </label>

          <label className="teacher-intro-description-field">
            <span>Course description</span>
            <textarea
              value={courseDescription}
              onChange={(event) => {
                setCourseDescription(event.target.value);
                setIntroVideoMessage("");
              }}
              placeholder="Short description students see before enrolling"
              disabled={savingIntroVideo}
              rows={3}
            />
          </label>

          <div className="teacher-intro-video-actions">
            <button type="submit" disabled={savingIntroVideo}>
              {savingIntroVideo ? "Saving..." : "Save Video"}
            </button>
            <button
              type="button"
              className="teacher-intro-video-preview-button"
              disabled={savingIntroVideo}
              onClick={() => {
                if (!introVideoUrl.trim()) {
                  setIntroVideoMessage("Enter a video URL to preview.");
                  return;
                }

                setIntroVideoMessage("");
                setShowIntroVideoPreview((currentValue) => !currentValue);
              }}
            >
              {showIntroVideoPreview ? "Hide Preview" : "Preview"}
            </button>
          </div>
        </form>

        {showIntroVideoPreview && introVideoUrl.trim() ? (
          <div className="teacher-intro-video-preview">
            <VideoPreview url={introVideoUrl} title="Introduction video" />
          </div>
        ) : null}

        {introVideoMessage ? (
          <p className="teacher-builder-message">{introVideoMessage}</p>
        ) : null}
      </section>

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
                    onEditQuiz={editQuizContent}
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

      {quizBuilder ? (
        <QuizBuilderModal
          builder={quizBuilder}
          saving={savingQuiz}
          onClose={closeQuizBuilder}
          onSubmit={saveQuizBuilder}
          onFieldChange={updateQuizBuilderField}
          onQuestionChange={updateQuizQuestion}
          onOptionChange={updateQuizOption}
          onCorrectOptionChange={setCorrectQuizOption}
          onAddQuestion={addQuizQuestion}
          onRemoveQuestion={removeQuizQuestion}
          onAddOption={addQuizOption}
          onRemoveOption={removeQuizOption}
        />
      ) : null}
    </main>
  );
}

function QuizBuilderModal({
  builder,
  saving,
  onClose,
  onSubmit,
  onFieldChange,
  onQuestionChange,
  onOptionChange,
  onCorrectOptionChange,
  onAddQuestion,
  onRemoveQuestion,
  onAddOption,
  onRemoveOption,
}) {
  return (
    <div className="teacher-course-modal-backdrop">
      <form className="teacher-quiz-modal" onSubmit={onSubmit}>
        <div className="teacher-course-modal-header">
          <div>
            <p>Quiz Builder</p>
            <h3>
              {builder.mode === "edit" ? "Edit lesson quiz" : "Create lesson quiz"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close quiz builder"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="teacher-quiz-main-fields">
          <label className="teacher-course-form-field">
            <span>Quiz name</span>
            <input
              type="text"
              value={builder.title}
              onChange={(event) => onFieldChange("title", event.target.value)}
              placeholder="e.g. Lesson checkpoint"
              disabled={saving}
              autoFocus
            />
          </label>

          <label className="teacher-course-form-field">
            <span>
              Pass threshold <small>Optional</small>
            </span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={builder.passThreshold}
              onChange={(event) =>
                onFieldChange("passThreshold", event.target.value)
              }
              placeholder="70"
              disabled={saving}
            />
          </label>
        </div>

        <div className="teacher-quiz-questions">
          {builder.questions.map((question, questionIndex) => (
            <section key={question.id} className="teacher-quiz-question-card">
              <div className="teacher-quiz-question-head">
                <div>
                  <span>Question {questionIndex + 1}</span>
                  <p>Single correct answer</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveQuestion(question.id)}
                  disabled={saving || builder.questions.length <= 1}
                  aria-label={`Remove question ${questionIndex + 1}`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>

              <label className="teacher-course-form-field">
                <span>Question text</span>
                <input
                  type="text"
                  value={question.question}
                  onChange={(event) =>
                    onQuestionChange(question.id, "question", event.target.value)
                  }
                  placeholder="Write your question"
                  disabled={saving}
                />
              </label>

              <div className="teacher-quiz-options">
                {question.options.map((option, optionIndex) => (
                  <label key={option.id} className="teacher-quiz-option-row">
                    <input
                      type="radio"
                      name={`correct-option-${question.id}`}
                      checked={option.isCorrect}
                      onChange={() =>
                        onCorrectOptionChange(question.id, option.id)
                      }
                      disabled={saving}
                      aria-label={`Mark option ${optionIndex + 1} as correct`}
                    />
                    <span>{String.fromCharCode(65 + optionIndex)}</span>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(event) =>
                        onOptionChange(
                          question.id,
                          option.id,
                          event.target.value
                        )
                      }
                      placeholder={`Option ${optionIndex + 1}`}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveOption(question.id, option.id)}
                      disabled={saving || question.options.length <= 2}
                      aria-label={`Remove option ${optionIndex + 1}`}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="teacher-quiz-soft-action"
                onClick={() => onAddOption(question.id)}
                disabled={saving}
              >
                <CirclePlus aria-hidden="true" />
                <span>Add option</span>
              </button>
            </section>
          ))}
        </div>

        <button
          type="button"
          className="teacher-quiz-add-question"
          onClick={onAddQuestion}
          disabled={saving}
        >
          <CirclePlus aria-hidden="true" />
          <span>Add question</span>
        </button>

        {builder.message ? (
          <p className="teacher-course-modal-message">{builder.message}</p>
        ) : null}

        <div className="teacher-course-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving
              ? builder.mode === "edit"
                ? "Updating quiz..."
                : "Saving quiz..."
              : builder.mode === "edit"
                ? "Update quiz"
                : "Save quiz"}
          </button>
        </div>
      </form>
    </div>
  );
}

function LessonContentPanel({
  draft,
  items,
  lessonId,
  onAdd,
  onEditQuiz,
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
          {draft.type === "material" ? (
            <label className="teacher-material-file-field">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  onUpdateDraft(
                    lessonId,
                    "file",
                    event.target.files?.[0] || null
                  )
                }
                disabled={saving}
              />
              <span className="teacher-material-file-button">Choose File</span>
              <span
                className={`teacher-material-file-name ${
                  draft.file ? "has-file" : ""
                }`}
              >
                {draft.file?.name || "No file chosen"}
              </span>
            </label>
          ) : null}
          {draft.type === "video" ? (
            <input
              type="text"
              value={draft.resource}
              onChange={(event) =>
                onUpdateDraft(lessonId, "resource", event.target.value)
              }
              placeholder="URL"
              disabled={saving}
            />
          ) : null}
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
                  {item.resource
                    ? item.type === "material"
                      ? " - PDF uploaded"
                      : ` - ${item.resource}`
                    : ""}
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
              {item.type === "material" && item.resource ? (
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
              {item.type === "quiz" ? (
                <button
                  type="button"
                  className="teacher-video-preview-button"
                  onClick={() => onEditQuiz(lessonId, item)}
                >
                  Edit
                </button>
              ) : null}
              {item.type === "video" && previewItemId === item.id ? (
                <VideoPreview url={item.resource} title={item.title} />
              ) : null}
              {item.type === "material" && previewItemId === item.id ? (
                <MaterialPreview url={item.resource} title={item.title} />
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

function MaterialPreview({ url, title }) {
  return (
    <div className="teacher-material-preview">
      <iframe src={url} title={`${title} material preview`} />
      <a href={url} target="_blank" rel="noreferrer">
        Open PDF
      </a>
    </div>
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

function createQuizOption(isCorrect = false) {
  return {
    id: `option-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: "",
    isCorrect,
  };
}

function createQuizQuestion() {
  return {
    id: `question-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    question: "",
    type: "single_choice",
    options: [createQuizOption(true), createQuizOption(false)],
  };
}

function mapQuizQuestionToBuilder(row) {
  const options = (row?.quize_options || [])
    .slice()
    .sort((firstOption, secondOption) => {
      const firstId = Number(firstOption?.oid) || 0;
      const secondId = Number(secondOption?.oid) || 0;
      return firstId - secondId;
    })
    .map((option) => ({
      id: `option-${option.oid}`,
      text: option.option_text || "",
      isCorrect: Boolean(option.is_correct),
    }));

  return {
    id: `question-${row?.qqid || Date.now()}`,
    question: row?.question || "",
    type: row?.type || "single_choice",
    options:
      options.length >= 2
        ? ensureQuizQuestionHasCorrectOption(options)
        : [createQuizOption(true), createQuizOption(false)],
  };
}

function ensureQuizQuestionHasCorrectOption(options) {
  if (options.some((option) => option.isCorrect)) {
    return options;
  }

  return options.map((option, index) => ({
    ...option,
    isCorrect: index === 0,
  }));
}

function normalizeQuizBuilder(builder) {
  const title = builder.title.trim();

  if (!title) {
    return { error: "Quiz name is required." };
  }

  const thresholdText = String(builder.passThreshold || "").trim();
  let passThreshold = null;

  if (thresholdText) {
    passThreshold = Number(thresholdText);

    if (
      Number.isNaN(passThreshold) ||
      passThreshold < 0 ||
      passThreshold > 100
    ) {
      return { error: "Pass threshold must be between 0 and 100." };
    }
  }

  const questions = [];

  for (const [questionIndex, question] of builder.questions.entries()) {
    const questionText = question.question.trim();

    if (!questionText) {
      return { error: `Question ${questionIndex + 1} text is required.` };
    }

    const options = question.options
      .map((option) => ({
        text: option.text.trim(),
        isCorrect: option.isCorrect,
      }))
      .filter((option) => option.text);

    if (options.length < 2) {
      return {
        error: `Question ${questionIndex + 1} needs at least two options.`,
      };
    }

    if (!options.some((option) => option.isCorrect)) {
      return {
        error: `Question ${questionIndex + 1} needs one correct option.`,
      };
    }

    questions.push({
      question: questionText,
      type: question.type || "single_choice",
      options,
    });
  }

  return {
    title,
    passThreshold,
    questions,
    error: "",
  };
}

async function deleteQuizDraft(quizId) {
  if (!quizId || !supabase) {
    return;
  }

  await supabase.from("quize").delete().eq("qid", quizId);
}

async function saveQuizQuestions(quizId, questions) {
  for (const question of questions) {
    const { data: questionRow, error: questionError } = await supabase
      .from("quize_questions")
      .insert({
        qid: quizId,
        question: question.question,
        type: question.type,
      })
      .select("qqid")
      .single();

    if (questionError) {
      return `Question save failed: ${questionError.message}`;
    }

    const optionRows = question.options.map((option) => ({
      qqid: questionRow.qqid,
      option_text: option.text,
      is_correct: option.isCorrect,
    }));

    const { error: optionError } = await supabase
      .from("quize_options")
      .insert(optionRows);

    if (optionError) {
      return `Option save failed: ${optionError.message}`;
    }
  }

  return "";
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
  const resourceValue = config.resourceColumn
    ? row?.[config.resourceColumn] || ""
    : "";

  return {
    id: `${type}-${idValue || row?.name}`,
    databaseId: idValue || null,
    type,
    label: fallbackLabel,
    title: row?.name || "Untitled",
    resource: resourceValue,
    description: row?.description || "",
    passThreshold: row?.pass_threshold ?? null,
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

function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
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

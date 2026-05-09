import { useEffect, useId, useRef, useState } from "react";
import { calculateAndStoreCourseProgress } from "../../lib/courseProgress";
import { supabase } from "../../lib/supabase";

const HEARTBEAT_MS = 3000;
const SEEK_DRIFT_SECONDS = 4;
const SEGMENT_SIZE_SECONDS = 10;
const COURSE_PROGRESS_REFRESH_MS = 15000;

let youtubeApiPromise = null;

export default function TrackedYouTubePlayer({
  videoId,
  videoDatabaseId,
  courseId,
  studentId,
  title,
  onComplete,
}) {
  const playerElementId = useId().replace(/:/g, "-");
  const playerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const resumePositionRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const lastTickRef = useRef(null);
  const endedRef = useRef(false);
  const lastCourseProgressRefreshRef = useRef(0);
  const sessionSegmentsRef = useRef(new Set());
  const sessionIdRef = useRef(createSessionId());
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let ignore = false;

    if (!videoId) {
      return undefined;
    }

    function getPosition() {
      try {
        return Number(playerRef.current?.getCurrentTime?.()) || 0;
      } catch {
        return 0;
      }
    }

    function getDuration() {
      try {
        return Number(playerRef.current?.getDuration?.()) || 0;
      } catch {
        return 0;
      }
    }

    function getPlaybackRate() {
      try {
        return Number(playerRef.current?.getPlaybackRate?.()) || 1;
      } catch {
        return 1;
      }
    }

    function canTrack() {
      return Boolean(supabase && studentId && videoDatabaseId);
    }

    async function refreshCourseProgress(force = false) {
      if (!studentId || !courseId) {
        return;
      }

      const now = Date.now();

      if (
        !force &&
        now - lastCourseProgressRefreshRef.current <
          COURSE_PROGRESS_REFRESH_MS
      ) {
        return;
      }

      lastCourseProgressRefreshRef.current = now;

      try {
        await calculateAndStoreCourseProgress({ studentId, courseId });
      } catch (error) {
        console.warn("Course progress calculation failed:", error.message);
      }
    }

    async function loadResumePosition() {
      if (!canTrack()) {
        return 0;
      }

      const { data, error } = await supabase
        .from("student_video")
        .select("last_position_seconds, duration_seconds")
        .eq("sid", studentId)
        .eq("vid", videoDatabaseId)
        .maybeSingle();

      if (error) {
        console.warn("Video resume load failed:", error.message);
        return 0;
      }

      const lastPosition = Number(data?.last_position_seconds || 0);
      const duration = Number(data?.duration_seconds || 0);

      if (duration > 0 && lastPosition >= duration - 5) {
        return 0;
      }

      return lastPosition > 2 ? lastPosition : 0;
    }

    async function recordEvent(eventType, payload = {}) {
      if (!canTrack()) {
        return;
      }

      const { error } = await supabase.from("student_video_events").insert({
        sid: studentId,
        vid: videoDatabaseId,
        session_id: sessionIdRef.current,
        event_type: eventType,
        playback_rate: getPlaybackRate(),
        ...payload,
      });

      if (error) {
        console.warn("Video event tracking failed:", error.message);
      }
    }

    async function updateSummary({
      position,
      watchedDelta = 0,
      completed = false,
    }) {
      if (!canTrack()) {
        return;
      }

      const duration = getDuration();
      let watchedSeconds = null;

      if (watchedDelta > 0) {
        const { data } = await supabase
          .from("student_video")
          .select("watched_seconds")
          .eq("sid", studentId)
          .eq("vid", videoDatabaseId)
          .maybeSingle();

        watchedSeconds = Number(data?.watched_seconds || 0) + watchedDelta;
      }

      const completionPercent = duration
        ? Math.min(100, Math.round((position / duration) * 100))
        : 0;
      const shouldMarkCompleted = completed || completionPercent >= 90;
      const summary = {
        sid: studentId,
        vid: videoDatabaseId,
        duration_seconds: duration,
        last_position_seconds: position,
        completion_percent: completionPercent,
        last_watched_at: new Date().toISOString(),
      };

      if (shouldMarkCompleted) {
        summary.completed = true;
        onCompleteRef.current?.();
      }

      if (watchedSeconds !== null) {
        summary.watched_seconds = watchedSeconds;
      }

      const { error } = await supabase
        .from("student_video")
        .upsert(summary, { onConflict: "sid,vid" });

      if (error) {
        console.warn("Video summary tracking failed:", error.message);
      }

      void refreshCourseProgress(shouldMarkCompleted);
    }

    async function incrementSummaryCounter(columnName) {
      if (!canTrack()) {
        return;
      }

      const { data } = await supabase
        .from("student_video")
        .select(columnName)
        .eq("sid", studentId)
        .eq("vid", videoDatabaseId)
        .maybeSingle();

      const currentValue = Number(data?.[columnName] || 0);
      const { error } = await supabase
        .from("student_video")
        .upsert(
          {
            sid: studentId,
            vid: videoDatabaseId,
            [columnName]: currentValue + 1,
            last_watched_at: new Date().toISOString(),
          },
          { onConflict: "sid,vid" }
        );

      if (error) {
        console.warn("Video counter tracking failed:", error.message);
      }
    }

    async function incrementSegment(startSecond, endSecond) {
      if (!canTrack()) {
        return;
      }

      const segmentKey = `${startSecond}-${endSecond}`;

      if (sessionSegmentsRef.current.has(segmentKey)) {
        return;
      }

      sessionSegmentsRef.current.add(segmentKey);

      const { data } = await supabase
        .from("student_video_segments")
        .select("svsid, watch_count")
        .eq("sid", studentId)
        .eq("vid", videoDatabaseId)
        .eq("start_second", startSecond)
        .eq("end_second", endSecond)
        .maybeSingle();

      if (data?.svsid) {
        const { error } = await supabase
          .from("student_video_segments")
          .update({
            watch_count: Number(data.watch_count || 0) + 1,
            last_watched_at: new Date().toISOString(),
          })
          .eq("svsid", data.svsid);

        if (error) {
          console.warn("Video segment update failed:", error.message);
        }

        return;
      }

      const { error } = await supabase.from("student_video_segments").insert({
        sid: studentId,
        vid: videoDatabaseId,
        start_second: startSecond,
        end_second: endSecond,
      });

      if (error) {
        console.warn("Video segment insert failed:", error.message);
      }
    }

    function recordWatchedSegments(fromSecond, toSecond) {
      const safeFrom = Math.max(0, Math.min(fromSecond, toSecond));
      const safeTo = Math.max(0, Math.max(fromSecond, toSecond));

      if (safeTo - safeFrom <= 0.25) {
        return;
      }

      const startBucket =
        Math.floor(safeFrom / SEGMENT_SIZE_SECONDS) * SEGMENT_SIZE_SECONDS;
      const endBucket =
        Math.floor((safeTo - 0.001) / SEGMENT_SIZE_SECONDS) *
        SEGMENT_SIZE_SECONDS;

      for (
        let segmentStart = startBucket;
        segmentStart <= endBucket;
        segmentStart += SEGMENT_SIZE_SECONDS
      ) {
        void incrementSegment(segmentStart, segmentStart + SEGMENT_SIZE_SECONDS);
      }
    }

    function stopHeartbeat() {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }

    function handleHeartbeat() {
      const now = Date.now();
      const position = getPosition();
      const previousTick = lastTickRef.current;

      if (!previousTick) {
        lastTickRef.current = { position, time: now };
        return;
      }

      const elapsedSeconds = (now - previousTick.time) / 1000;
      const expectedDelta = elapsedSeconds * getPlaybackRate();
      const actualDelta = position - previousTick.position;
      const drift = actualDelta - expectedDelta;

      if (Math.abs(drift) > SEEK_DRIFT_SECONDS) {
        const eventType = actualDelta >= 0 ? "seek_forward" : "seek_backward";
        sessionSegmentsRef.current.clear();

        void recordEvent(eventType, {
          from_second: previousTick.position,
          to_second: position,
          position_second: position,
        });
        void incrementSummaryCounter("seek_count");

        if (eventType === "seek_backward") {
          void incrementSummaryCounter("replay_count");
        }

        lastTickRef.current = { position, time: now };
        void updateSummary({ position });
        return;
      }

      if (actualDelta > 0.25) {
        void recordEvent("heartbeat", {
          from_second: previousTick.position,
          to_second: position,
          position_second: position,
          watched_delta_seconds: actualDelta,
        });
        void updateSummary({ position, watchedDelta: actualDelta });
        recordWatchedSegments(previousTick.position, position);
      }

      lastTickRef.current = { position, time: now };
    }

    function startHeartbeat() {
      stopHeartbeat();
      lastTickRef.current = { position: getPosition(), time: Date.now() };
      heartbeatRef.current = window.setInterval(handleHeartbeat, HEARTBEAT_MS);
    }

    function handleReady() {
      const resumePosition = resumePositionRef.current;

      if (resumePosition > 0) {
        playerRef.current?.seekTo?.(resumePosition, true);
      }

      const position = resumePosition || getPosition();
      void updateSummary({ position });
    }

    function handleStateChange(event) {
      const YT = window.YT;
      const position = getPosition();

      if (event.data === YT.PlayerState.PLAYING) {
        const resumedAfterEnd = endedRef.current;
        endedRef.current = false;
        startHeartbeat();

        void recordEvent(resumedAfterEnd ? "replay" : "play", {
          position_second: position,
        });
        void incrementSummaryCounter(
          resumedAfterEnd ? "replay_count" : "play_count"
        );
        return;
      }

      if (event.data === YT.PlayerState.PAUSED) {
        stopHeartbeat();
        void recordEvent("pause", { position_second: position });
        void incrementSummaryCounter("pause_count");
        void updateSummary({ position });
        return;
      }

      if (event.data === YT.PlayerState.ENDED) {
        stopHeartbeat();
        endedRef.current = true;
        sessionSegmentsRef.current.clear();

        const duration = getDuration();
        void recordEvent("ended", {
          position_second: duration || position,
          to_second: duration || position,
        });
        void updateSummary({
          position: duration || position,
          completed: true,
        });
        void refreshCourseProgress(true);
      }
    }

    loadResumePosition()
      .then((resumePosition) => {
        resumePositionRef.current = resumePosition;

        return loadYouTubeIframeApi();
      })
      .then((YT) => {
        if (ignore) {
          return;
        }

        playerRef.current = new YT.Player(playerElementId, {
          videoId,
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: handleReady,
            onStateChange: handleStateChange,
          },
        });
      })
      .catch(() => {
        if (!ignore) {
          setLoadFailed(true);
        }
      });

    return () => {
      ignore = true;
      stopHeartbeat();
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [
    courseId,
    playerElementId,
    studentId,
    videoDatabaseId,
    videoId,
  ]);

  if (loadFailed) {
    return (
      <div className="course-preview-video">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={`${title} preview`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="course-preview-video">
      <div id={playerElementId} title={`${title} preview`} />
    </div>
  );
}

function loadYouTubeIframeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previousReadyHandler = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previousReadyHandler?.();
        resolve(window.YT);
      };

      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      if (existingScript) {
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  return youtubeApiPromise;
}

function createSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `video-session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

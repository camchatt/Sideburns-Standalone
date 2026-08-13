/**
 * User-built main quests: multi-stop threads with a reward at the end.
 * Guardrails keep threads short, walkable, and readable — the rest is theirs.
 */

import type { LatLng } from "./geo";

export type QuestStopCheck =
  | { type: "presence" }
  | { type: "answer"; answer: string; altAnswers?: string[] }
  /** Player finishes by capturing a photo (honor-system proof). */
  | { type: "photo" };

export type QuestThreadStop = {
  id: string;
  /** Short clue / prompt shown at this stop. */
  clue: string;
  lat: number;
  lng: number;
  check: QuestStopCheck;
  /** Optional soft nudge — never the answer. */
  hint?: string;
  /**
   * Optional reference image — what to look for.
   * Compressed data URL or remote URL; not the secret answer.
   */
  clueImage?: string | null;
};

export type QuestThread = {
  id: string;
  title: string;
  /** One-line vibe / invitation. */
  pitch: string;
  sponsor: string | null;
  /** What a finisher gets if they succeed. */
  reward: string;
  stops: QuestThreadStop[];
  createdAt: string;
  expiresAt: string | null;
  live: boolean;
};

export type QuestThreadProgress = {
  threadId: string;
  completedStopIds: string[];
  finishedAt: string | null;
};

export type QuestThreadPin = {
  id: string;
  threadId: string;
  stopIndex: number;
  title: string;
  clue: string;
  lat: number;
  lng: number;
  done: boolean;
  /** Current stop the player can attempt. */
  active: boolean;
};

/* ------------------------------------------------------------------ */
/* Guardrails                                                          */
/* ------------------------------------------------------------------ */

export const QUEST_GUARDRAILS = {
  minStops: 2,
  maxStops: 5,
  minStopDistanceM: 50,
  titleMin: 3,
  titleMax: 40,
  pitchMin: 12,
  pitchMax: 140,
  rewardMin: 3,
  rewardMax: 80,
  clueMin: 8,
  clueMax: 120,
  hintMax: 80,
  answerMin: 2,
  answerMax: 40,
  maxLocalThreads: 8,
  checkInRadiusM: 75,
  minCheckInRadiusM: 40,
} as const;

const PLACEHOLDER_RE =
  /^(test|asdf|qwerty|xxx|aaa|quest\s*\d*|untitled|n\/?a|none|nothing|tbd|todo)$/i;

const STORAGE_KEY = "artelier.sidequester.quest-threads.v1";
const PROGRESS_KEY = "artelier.sidequester.quest-progress.v1";

export type UserLocation = LatLng & { accuracy: number };

const EARTH_RADIUS_M = 6_371_000;

function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizeQuestText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|a|an|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimLen(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export type QuestValidationIssue = { field: string; message: string };

export function validateQuestDraft(input: {
  title: string;
  pitch: string;
  reward: string;
  sponsor?: string;
  stops: Array<{
    clue: string;
    lat: number;
    lng: number;
    check: QuestStopCheck;
    hint?: string;
  }>;
}): QuestValidationIssue[] {
  const issues: QuestValidationIssue[] = [];
  const title = input.title.trim();
  const pitch = input.pitch.trim();
  const reward = input.reward.trim();

  if (title.length < QUEST_GUARDRAILS.titleMin) {
    issues.push({ field: "title", message: "Give it a real title (a few words)." });
  } else if (title.length > QUEST_GUARDRAILS.titleMax) {
    issues.push({
      field: "title",
      message: `Title max ${QUEST_GUARDRAILS.titleMax} characters.`,
    });
  } else if (PLACEHOLDER_RE.test(title)) {
    issues.push({ field: "title", message: "That title is placeholder slop — try again." });
  }

  if (pitch.length < QUEST_GUARDRAILS.pitchMin) {
    issues.push({
      field: "pitch",
      message: "Pitch needs a little more vibe (one short sentence).",
    });
  } else if (pitch.length > QUEST_GUARDRAILS.pitchMax) {
    issues.push({
      field: "pitch",
      message: `Pitch max ${QUEST_GUARDRAILS.pitchMax} characters.`,
    });
  }

  if (reward.length < QUEST_GUARDRAILS.rewardMin) {
    issues.push({ field: "reward", message: "Say what they get if they succeed." });
  } else if (reward.length > QUEST_GUARDRAILS.rewardMax) {
    issues.push({
      field: "reward",
      message: `Reward max ${QUEST_GUARDRAILS.rewardMax} characters.`,
    });
  } else if (PLACEHOLDER_RE.test(reward)) {
    issues.push({
      field: "reward",
      message: "Reward can’t be empty filler — gift something real.",
    });
  }

  if (input.stops.length < QUEST_GUARDRAILS.minStops) {
    issues.push({
      field: "stops",
      message: `Need at least ${QUEST_GUARDRAILS.minStops} stops for a thread.`,
    });
  }
  if (input.stops.length > QUEST_GUARDRAILS.maxStops) {
    issues.push({
      field: "stops",
      message: `Max ${QUEST_GUARDRAILS.maxStops} stops — keep it walkable.`,
    });
  }

  input.stops.forEach((stop, index) => {
    const clue = stop.clue.trim();
    if (clue.length < QUEST_GUARDRAILS.clueMin) {
      issues.push({
        field: `stop-${index}`,
        message: `Stop ${index + 1}: write a clearer clue.`,
      });
    } else if (clue.length > QUEST_GUARDRAILS.clueMax) {
      issues.push({
        field: `stop-${index}`,
        message: `Stop ${index + 1}: clue is too long.`,
      });
    }
    if (stop.check.type === "answer") {
      const answer = stop.check.answer.trim();
      if (
        answer.length < QUEST_GUARDRAILS.answerMin ||
        answer.length > QUEST_GUARDRAILS.answerMax
      ) {
        issues.push({
          field: `stop-${index}`,
          message: `Stop ${index + 1}: answer must be ${QUEST_GUARDRAILS.answerMin}–${QUEST_GUARDRAILS.answerMax} characters.`,
        });
      }
    }
    if (stop.hint && stop.hint.trim().length > QUEST_GUARDRAILS.hintMax) {
      issues.push({
        field: `stop-${index}`,
        message: `Stop ${index + 1}: hint is too long.`,
      });
    }
  });

  for (let i = 0; i < input.stops.length; i++) {
    for (let j = i + 1; j < input.stops.length; j++) {
      const d = distanceMeters(input.stops[i], input.stops[j]);
      if (d < QUEST_GUARDRAILS.minStopDistanceM) {
        issues.push({
          field: "stops",
          message: `Stops ${i + 1} and ${j + 1} are too close — spread them out (~${QUEST_GUARDRAILS.minStopDistanceM}m+).`,
        });
        return issues;
      }
    }
  }

  return issues;
}

export function createQuestThread(input: {
  title: string;
  pitch: string;
  reward: string;
  sponsor?: string | null;
  stops: Array<{
    clue: string;
    lat: number;
    lng: number;
    check: QuestStopCheck;
    hint?: string;
    clueImage?: string | null;
  }>;
  expiresAt?: string | null;
  live?: boolean;
}): { ok: true; thread: QuestThread } | { ok: false; issues: QuestValidationIssue[] } {
  const issues = validateQuestDraft(input);
  if (issues.length) return { ok: false, issues };

  const thread: QuestThread = {
    id: newId("quest"),
    title: trimLen(input.title, QUEST_GUARDRAILS.titleMax),
    pitch: trimLen(input.pitch, QUEST_GUARDRAILS.pitchMax),
    sponsor: input.sponsor?.trim() || null,
    reward: trimLen(input.reward, QUEST_GUARDRAILS.rewardMax),
    stops: input.stops.map((stop, index) => {
      let check: QuestStopCheck;
      if (stop.check.type === "presence") {
        check = { type: "presence" };
      } else if (stop.check.type === "photo") {
        check = { type: "photo" };
      } else {
        check = {
          type: "answer",
          answer: trimLen(stop.check.answer, QUEST_GUARDRAILS.answerMax),
          altAnswers: stop.check.altAnswers
            ?.map((a) => trimLen(a, QUEST_GUARDRAILS.answerMax))
            .filter(Boolean),
        };
      }
      return {
        id: newId(`stop${index + 1}`),
        clue: trimLen(stop.clue, QUEST_GUARDRAILS.clueMax),
        lat: stop.lat,
        lng: stop.lng,
        check,
        hint: stop.hint?.trim()
          ? trimLen(stop.hint, QUEST_GUARDRAILS.hintMax)
          : undefined,
        clueImage: stop.clueImage?.trim() || null,
      };
    }),
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    live: Boolean(input.live),
  };
  return { ok: true, thread };
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function isThread(value: unknown): value is QuestThread {
  if (!value || typeof value !== "object") return false;
  const t = value as QuestThread;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    Array.isArray(t.stops) &&
    t.stops.length >= 1
  );
}

export function loadQuestThreads(): QuestThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isThread);
  } catch {
    return [];
  }
}

export function saveQuestThreads(threads: QuestThread[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

export function loadQuestProgress(): QuestThreadProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is QuestThreadProgress =>
        Boolean(p) &&
        typeof p === "object" &&
        typeof (p as QuestThreadProgress).threadId === "string" &&
        Array.isArray((p as QuestThreadProgress).completedStopIds),
    );
  } catch {
    return [];
  }
}

export function saveQuestProgress(progress: QuestThreadProgress[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function progressFor(
  progress: QuestThreadProgress[],
  threadId: string,
): QuestThreadProgress {
  return (
    progress.find((p) => p.threadId === threadId) ?? {
      threadId,
      completedStopIds: [],
      finishedAt: null,
    }
  );
}

export function currentStopIndex(
  thread: QuestThread,
  progress: QuestThreadProgress,
): number {
  if (progress.finishedAt) return thread.stops.length;
  for (let i = 0; i < thread.stops.length; i++) {
    if (!progress.completedStopIds.includes(thread.stops[i].id)) return i;
  }
  return thread.stops.length;
}

/** Pins to show: completed + current active stop (sequential reveal). */
export function visibleQuestPins(
  threads: QuestThread[],
  progressList: QuestThreadProgress[],
): QuestThreadPin[] {
  const pins: QuestThreadPin[] = [];
  for (const thread of threads) {
    const progress = progressFor(progressList, thread.id);
    const current = currentStopIndex(thread, progress);
    thread.stops.forEach((stop, index) => {
      const done = progress.completedStopIds.includes(stop.id);
      const active = index === current && !progress.finishedAt;
      if (!done && !active) return;
      pins.push({
        id: stop.id,
        threadId: thread.id,
        stopIndex: index,
        title: thread.title,
        clue: stop.clue,
        lat: stop.lat,
        lng: stop.lng,
        done,
        active,
      });
    });
  }
  return pins;
}

export function answersMatchQuest(
  guess: string,
  answer: string,
  altAnswers: string[] = [],
): boolean {
  const normalized = normalizeQuestText(guess);
  if (!normalized) return false;
  return [answer, ...altAnswers]
    .map(normalizeQuestText)
    .some((candidate) => candidate === normalized);
}

export type QuestCheckInStatus =
  | "ready"
  | "no-fix"
  | "too-vague"
  | "too-far"
  | "blocked";

export function evaluateQuestPresence(input: {
  site: LatLng;
  location: UserLocation | null;
  blockedReason?: string | null;
}): {
  status: QuestCheckInStatus;
  label: string;
  note: string | null;
  distanceM: number | null;
} {
  const radius = Math.max(
    QUEST_GUARDRAILS.minCheckInRadiusM,
    QUEST_GUARDRAILS.checkInRadiusM,
  );
  if (input.blockedReason) {
    return {
      status: "blocked",
      label: "Not yet",
      note: input.blockedReason,
      distanceM: input.location
        ? distanceMeters(input.location, input.site)
        : null,
    };
  }
  if (!input.location) {
    return {
      status: "no-fix",
      label: "No position yet",
      note: "Turn on Locate Me, then walk to the stop.",
      distanceM: null,
    };
  }
  const distance = distanceMeters(input.location, input.site);
  const accuracy = input.location.accuracy;
  if (accuracy > Math.max(30, radius)) {
    return {
      status: "too-vague",
      label: "Position too vague",
      note: `GPS ~${Math.round(accuracy)} m — step into the open.`,
      distanceM: distance,
    };
  }
  if (distance > radius) {
    return {
      status: "too-far",
      label: `Walk closer (${radius} m)`,
      note: null,
      distanceM: distance,
    };
  }
  return {
    status: "ready",
    label: "Check in",
    note: null,
    distanceM: distance,
  };
}

export function completeQuestStop(
  thread: QuestThread,
  progress: QuestThreadProgress,
  stopId: string,
  guess?: string,
  location?: UserLocation | null,
  options?: { photoCaptured?: boolean },
):
  | { ok: true; progress: QuestThreadProgress; finished: boolean }
  | { ok: false; reason: string } {
  const index = thread.stops.findIndex((s) => s.id === stopId);
  if (index < 0) return { ok: false, reason: "Unknown stop." };
  const current = currentStopIndex(thread, progress);
  if (index !== current) {
    return { ok: false, reason: "Finish the earlier stops first." };
  }
  const stop = thread.stops[index];
  if (stop.check.type === "presence") {
    const verdict = evaluateQuestPresence({
      site: stop,
      location: location ?? null,
    });
    if (verdict.status !== "ready") {
      return { ok: false, reason: verdict.note ?? verdict.label };
    }
  } else if (stop.check.type === "photo") {
    if (!options?.photoCaptured) {
      return { ok: false, reason: "Snap a photo of what you found." };
    }
  } else if (
    !answersMatchQuest(
      guess ?? "",
      stop.check.answer,
      stop.check.altAnswers,
    )
  ) {
    return { ok: false, reason: "Not quite — try again." };
  }

  const completedStopIds = [...progress.completedStopIds, stop.id];
  const finished = completedStopIds.length >= thread.stops.length;
  return {
    ok: true,
    finished,
    progress: {
      threadId: thread.id,
      completedStopIds,
      finishedAt: finished ? new Date().toISOString() : null,
    },
  };
}

export function questThreadStats(
  threads: QuestThread[],
  progressList: QuestThreadProgress[],
) {
  const finished = progressList.filter((p) => p.finishedAt).length;
  const inProgress = progressList.filter(
    (p) => !p.finishedAt && p.completedStopIds.length > 0,
  ).length;
  return {
    total: threads.length,
    finished,
    inProgress,
    open: Math.max(0, threads.length - finished),
  };
}

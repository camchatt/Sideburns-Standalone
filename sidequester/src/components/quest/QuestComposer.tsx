import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  QUEST_GUARDRAILS,
  type QuestStopCheck,
} from "@artelier/playa-core";
import { Camera, Check, ImagePlus, MapPin, Trash2, X } from "lucide-react";
import { compressImageFile } from "@/lib/compressImage";

export type MissionCompletion = "phrase" | "photo" | null;

export type DraftQuestStop = {
  key: string;
  clue: string;
  details: string;
  lat: number;
  lng: number;
  check: QuestStopCheck;
  hint: string;
  completion: MissionCompletion;
  /** Reference image — what to look for. */
  clueImage: string | null;
};

type Card = "setup" | "mission" | "finale";

type Props = {
  questName: string;
  epilogue: string;
  reward: string;
  stops: DraftQuestStop[];
  missionTitle: string;
  missionDetails: string;
  missionCompletion: MissionCompletion;
  missionAnswer: string;
  missionClueImage: string | null;
  placingMode: boolean;
  formError: string;
  /** Parent already shows the quest name (Sideburns composer). */
  hideNameField?: boolean;
  /** Skip straight to this card (e.g. first-pin setup after Next). */
  initialCard?: Card;
  onQuestNameChange: (value: string) => void;
  onEpilogueChange: (value: string) => void;
  onRewardChange: (value: string) => void;
  onMissionTitleChange: (value: string) => void;
  onMissionDetailsChange: (value: string) => void;
  onMissionCompletionChange: (value: MissionCompletion) => void;
  onMissionAnswerChange: (value: string) => void;
  onMissionClueImageChange: (value: string | null) => void;
  onRemoveStop: (key: string) => void;
  onPlacePin: () => void;
  onCancelPlacing: () => void;
  onPublish: () => void;
};

/**
 * Quest builder — name → missions → gift.
 * Only ships completion modes the engine can honor.
 */
export function QuestComposer({
  questName,
  epilogue,
  reward,
  stops,
  missionTitle,
  missionDetails,
  missionCompletion,
  missionAnswer,
  missionClueImage,
  placingMode,
  formError,
  hideNameField = false,
  initialCard = "setup",
  onQuestNameChange,
  onEpilogueChange,
  onRewardChange,
  onMissionTitleChange,
  onMissionDetailsChange,
  onMissionCompletionChange,
  onMissionAnswerChange,
  onMissionClueImageChange,
  onRemoveStop,
  onPlacePin,
  onCancelPlacing,
  onPublish,
}: Props) {
  const [card, setCard] = useState<Card>(initialCard);
  const [entered, setEntered] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const [actionPhotoPreview, setActionPhotoPreview] = useState<string | null>(
    null,
  );
  const clueImageInputRef = useRef<HTMLInputElement>(null);
  const actionPhotoInputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    setEntered(false);
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [card]);

  useEffect(() => {
    setCard(initialCard);
  }, [initialCard]);

  useEffect(() => {
    setActionPhotoPreview(null);
  }, [missionCompletion]);

  const setupReady = questName.trim().length >= QUEST_GUARDRAILS.titleMin;

  const missionReady =
    missionTitle.trim().length >= QUEST_GUARDRAILS.clueMin &&
    (missionCompletion !== "phrase" ||
      missionAnswer.trim().length >= QUEST_GUARDRAILS.answerMin) &&
    stops.length < QUEST_GUARDRAILS.maxStops;

  const onPickClueImage = async (file: File | null) => {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await compressImageFile(file);
      onMissionClueImageChange(dataUrl);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : "Couldn’t use that image.",
      );
    }
  };

  const onPickActionPhoto = (file: File | null) => {
    if (!file) return;
    if (actionPhotoPreview) URL.revokeObjectURL(actionPhotoPreview);
    setActionPhotoPreview(URL.createObjectURL(file));
  };

  const canPublish =
    stops.length >= QUEST_GUARDRAILS.minStops &&
    reward.trim().length >= QUEST_GUARDRAILS.rewardMin &&
    epilogue.trim().length >= QUEST_GUARDRAILS.pitchMin;

  const setupHint = !questName.trim()
    ? "Give it a name wanderers can say yes to"
    : questName.trim().length < QUEST_GUARDRAILS.titleMin
      ? "A few more letters…"
      : null;

  const missionHint =
    missionCompletion === "phrase" &&
    missionAnswer.trim().length < QUEST_GUARDRAILS.answerMin &&
    missionTitle.trim().length >= QUEST_GUARDRAILS.clueMin
      ? "Add the magic phrase"
      : null;

  const finaleHint =
    reward.trim().length < QUEST_GUARDRAILS.rewardMin
      ? "What do they receive at the end?"
      : epilogue.trim().length < QUEST_GUARDRAILS.pitchMin
        ? "Leave a short closing note"
        : null;

  const go = (next: Card) => setCard(next);

  return (
    <section className="quest-composer" aria-label="Build a quest">
      <div
        className={`quest-composer-card ${entered ? "is-in" : "is-out"}`}
        key={card}
      >
        {card === "setup" ? (
          <>
            <p className="quest-composer-kicker">Leave a thread in the dust</p>
            <h2 className="quest-composer-title">Quest</h2>
            <p className="quest-composer-lede">
              {hideNameField
                ? "Next you’ll place the stops on the playa."
                : "Name the adventure. You’ll place the stops next."}
            </p>

            {hideNameField ? null : (
              <Field label="Name">
                <input
                  value={questName}
                  name="quest-name"
                  autoComplete="off"
                  maxLength={QUEST_GUARDRAILS.titleMax}
                  onChange={(e) => onQuestNameChange(e.target.value)}
                  placeholder="Find the last cold orange…"
                  className="quest-composer-input"
                  aria-describedby={formError ? errorId : undefined}
                />
              </Field>
            )}

            {formError ? (
              <p id={errorId} className="quest-composer-error" role="alert">
                {formError}
              </p>
            ) : setupHint ? (
              <p className="quest-composer-hint">{setupHint}</p>
            ) : null}

            <button
              type="button"
              disabled={!setupReady}
              onClick={() => go("mission")}
              className="quest-composer-cta"
            >
              Begin missions
            </button>
          </>
        ) : null}

        {card === "mission" ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="quest-composer-kicker truncate">
                {questName || "Quest"} · pin {stops.length + 1}
              </p>
              {hideNameField ? null : (
                <button
                  type="button"
                  disabled={placingMode}
                  onClick={() => go("setup")}
                  className="min-h-9 shrink-0 px-1 text-[10px] uppercase tracking-widest text-[#3f454c]/45"
                >
                  Name
                </button>
              )}
            </div>

            {stops.length > 0 ? (
              <ol className="quest-route" aria-label="Placed missions">
                {stops.map((stop, index) => (
                  <li key={stop.key} className="quest-route-item">
                    <span className="quest-route-node" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#3f454c]/80">
                      {stop.clue}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove mission ${index + 1}`}
                      disabled={placingMode}
                      onClick={() => onRemoveStop(stop.key)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#3f454c]/35"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}

            {stops.length < QUEST_GUARDRAILS.maxStops ? (
              <>
                <div className="mt-2">
                  <div className="quest-field-label">
                    <span>Clue</span>
                    <input
                      ref={clueImageInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={placingMode}
                      onChange={(e) => {
                        void onPickClueImage(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={placingMode}
                      aria-label="Add clue picture"
                      onClick={() => clueImageInputRef.current?.click()}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#3f454c]/45 transition-colors hover:bg-[#3f454c]/8 hover:text-[#3f454c]/75"
                    >
                      <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <input
                    value={missionTitle}
                    name="mission-clue"
                    autoComplete="off"
                    maxLength={QUEST_GUARDRAILS.clueMax}
                    onChange={(e) => onMissionTitleChange(e.target.value)}
                    disabled={placingMode}
                    placeholder="Find the brass unicorn…"
                    className="quest-composer-input"
                  />
                  {missionClueImage ? (
                    <div className="relative mt-2 overflow-hidden rounded-xl">
                      <img
                        src={missionClueImage}
                        alt="Clue reference"
                        className="aspect-[16/9] w-full object-cover"
                      />
                      <button
                        type="button"
                        disabled={placingMode}
                        aria-label="Remove clue picture"
                        onClick={() => onMissionClueImageChange(null)}
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#17130f]/70 text-[#f8f5ee]"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  ) : null}
                  {imageError ? (
                    <p className="mt-1 text-[12px] text-[#a83223]">{imageError}</p>
                  ) : null}
                </div>

                <Field label="Details">
                  <textarea
                    value={missionDetails}
                    name="mission-details"
                    autoComplete="off"
                    maxLength={QUEST_GUARDRAILS.hintMax}
                    onChange={(e) => onMissionDetailsChange(e.target.value)}
                    disabled={placingMode}
                    rows={2}
                    placeholder="Listen for accordion after sunset…"
                    className="quest-composer-input quest-composer-textarea"
                  />
                </Field>

                <div className="mt-2">
                  <p className="quest-field-label">Action</p>
                  <div className="mt-1.5 flex flex-wrap gap-3" role="group" aria-label="Action">
                    {(
                      [
                        ["photo", "Take Photo"],
                        ["phrase", "Magic Phrase"],
                      ] as const
                    ).map(([id, label]) => {
                      const active = missionCompletion === id;
                      return (
                        <label
                          key={id}
                          className={`inline-flex min-h-9 cursor-pointer items-center gap-2 text-[12px] text-[#3f454c]/75 ${
                            placingMode ? "pointer-events-none opacity-50" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            disabled={placingMode}
                            onChange={() =>
                              onMissionCompletionChange(active ? null : id)
                            }
                            className="sr-only"
                          />
                          <span
                            className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                              active
                                ? "border-[#c44569] bg-[#c44569] text-[#fff0f4]"
                                : "border-[#3f454c]/30 bg-transparent"
                            }`}
                            aria-hidden
                          >
                            {active ? (
                              <Check className="h-2.5 w-2.5" strokeWidth={3} />
                            ) : null}
                          </span>
                          {label}
                        </label>
                      );
                    })}
                  </div>

                  {missionCompletion === "photo" ? (
                    <div className="mt-2">
                      <input
                        ref={actionPhotoInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        disabled={placingMode}
                        onChange={(e) => {
                          onPickActionPhoto(e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                      />
                      {actionPhotoPreview ? (
                        <div className="relative overflow-hidden rounded-xl">
                          <img
                            src={actionPhotoPreview}
                            alt="Action photo preview"
                            className="aspect-[16/9] w-full object-cover"
                          />
                          <button
                            type="button"
                            disabled={placingMode}
                            aria-label="Remove action photo"
                            onClick={() => {
                              if (actionPhotoPreview)
                                URL.revokeObjectURL(actionPhotoPreview);
                              setActionPhotoPreview(null);
                            }}
                            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#17130f]/70 text-[#f8f5ee]"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={placingMode}
                          onClick={() => actionPhotoInputRef.current?.click()}
                          aria-label="Take or upload photo"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#3f454c]/8 text-[#3f454c]/70"
                        >
                          <Camera className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  ) : missionCompletion === "phrase" ? (
                    <input
                      value={missionAnswer}
                      name="mission-phrase"
                      autoComplete="off"
                      maxLength={QUEST_GUARDRAILS.answerMax}
                      onChange={(e) => onMissionAnswerChange(e.target.value)}
                      disabled={placingMode}
                      placeholder="Magic phrase"
                      className="quest-composer-input mt-1"
                    />
                  ) : (
                    <input
                      value={missionAnswer}
                      name="mission-action"
                      autoComplete="off"
                      maxLength={QUEST_GUARDRAILS.answerMax}
                      onChange={(e) => onMissionAnswerChange(e.target.value)}
                      disabled={placingMode}
                      placeholder="What should they do?"
                      className="quest-composer-input mt-1"
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-[#3f454c]/60">
                Max {QUEST_GUARDRAILS.maxStops} beats — seal the gift when ready.
              </p>
            )}

            {formError ? (
              <p className="quest-composer-error" role="alert">
                {formError}
              </p>
            ) : missionHint ? (
              <p className="quest-composer-hint">{missionHint}</p>
            ) : null}

            <div className="mt-2 flex flex-col gap-1">
              {placingMode ? (
                <button
                  type="button"
                  onClick={onCancelPlacing}
                  className="quest-composer-cta quest-composer-cta-ghost"
                >
                  Cancel placement
                </button>
              ) : (
                <>
                  {stops.length < QUEST_GUARDRAILS.maxStops ? (
                    <button
                      type="button"
                      disabled={!missionReady}
                      onClick={onPlacePin}
                      className="quest-composer-cta"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      Place on map
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={stops.length < QUEST_GUARDRAILS.minStops}
                    onClick={() => go("finale")}
                    className="quest-composer-cta quest-composer-cta-secondary"
                  >
                    {stops.length < QUEST_GUARDRAILS.minStops
                      ? `Add ${QUEST_GUARDRAILS.minStops - stops.length} more`
                      : "Finale"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}

        {card === "finale" ? (
          <>
            <button
              type="button"
              disabled={placingMode}
              onClick={() => go("mission")}
              className="mb-1 text-[10px] uppercase tracking-widest text-[#3f454c]/45"
            >
              ← Missions
            </button>
            <p className="quest-composer-kicker truncate">
              {questName || "Quest"} · {stops.length} beats
            </p>
            <h2 className="quest-composer-title">The gift</h2>
            <p className="quest-composer-lede">
              What they receive — and what they carry after.
            </p>

            <Field label="Reward">
              <input
                value={reward}
                name="quest-reward"
                autoComplete="off"
                maxLength={QUEST_GUARDRAILS.rewardMax}
                onChange={(e) => onRewardChange(e.target.value)}
                placeholder="Cold coconut · a secret · shade"
                className="quest-composer-input"
              />
            </Field>

            <Field label="Epilogue">
              <textarea
                value={epilogue}
                name="quest-epilogue"
                autoComplete="off"
                maxLength={QUEST_GUARDRAILS.pitchMax}
                onChange={(e) => onEpilogueChange(e.target.value)}
                rows={2}
                placeholder="You walked farther than you meant to…"
                className="quest-composer-input quest-composer-textarea"
              />
            </Field>

            {formError ? (
              <p className="quest-composer-error" role="alert">
                {formError}
              </p>
            ) : finaleHint ? (
              <p className="quest-composer-hint">{finaleHint}</p>
            ) : (
              <p className="quest-composer-hint">
                Ready to release onto the playa.
              </p>
            )}

            <button
              type="button"
              disabled={!canPublish}
              onClick={onPublish}
              className="quest-composer-cta"
            >
              Release onto the playa
            </button>
          </>
        ) : null}
      </div>

      <style>{questComposerCss}</style>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mt-2 block">
      <span className="quest-field-label">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const questComposerCss = `
  .quest-composer-card {
    position: relative;
    overflow: hidden;
    border-radius: 1rem;
    padding: 0.85rem 0.95rem 0.95rem;
    background:
      radial-gradient(110% 70% at 0% 0%, rgba(196, 69, 105, 0.1), transparent 55%),
      radial-gradient(80% 60% at 100% 100%, rgba(232, 145, 46, 0.07), transparent 50%),
      linear-gradient(165deg, #faf7f1 0%, #f2ebe1 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 0 0 1px rgba(63, 69, 76, 0.06);
    transform: translateX(0);
    opacity: 1;
    transition: opacity 220ms ease, transform 220ms ease;
  }
  .quest-composer-card.is-out {
    opacity: 0;
    transform: translateX(10px);
  }
  .quest-composer-card.is-in {
    opacity: 1;
    transform: translateX(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .quest-composer-card {
      transition: none;
    }
  }
  .quest-composer-kicker {
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(63, 69, 76, 0.45);
  }
  .quest-composer-title {
    margin-top: 0.1rem;
    font-family: var(--font-display, ui-serif, Georgia, serif);
    font-size: 1.35rem;
    line-height: 1.05;
    letter-spacing: 0.03em;
    color: #3f454c;
  }
  .quest-composer-lede {
    margin-top: 0.25rem;
    font-size: 12px;
    line-height: 1.3;
    color: rgba(63, 69, 76, 0.58);
  }
  .quest-field-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(63, 69, 76, 0.55);
  }
  .quest-field-hint {
    letter-spacing: 0.08em;
    text-transform: none;
    font-weight: 400;
    color: rgba(63, 69, 76, 0.38);
  }
  .quest-composer-input {
    width: 100%;
    border: 0;
    border-bottom: 1px solid rgba(63, 69, 76, 0.18);
    background: transparent;
    padding: 0.4rem 0;
    font-size: 15px;
    color: #3f454c;
    outline: none;
  }
  .quest-composer-input::placeholder {
    color: rgba(63, 69, 76, 0.32);
  }
  .quest-composer-input:focus-visible {
    outline: 2px solid rgba(196, 69, 105, 0.55);
    outline-offset: 3px;
    border-bottom-color: #c44569;
  }
  .quest-composer-textarea {
    resize: none;
    line-height: 1.35;
  }
  .quest-route {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .quest-route-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2rem;
  }
  .quest-route-node {
    display: inline-flex;
    height: 1.4rem;
    width: 1.4rem;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgba(196, 69, 105, 0.12);
    color: #c44569;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .quest-composer-cta {
    display: inline-flex;
    min-height: 2.5rem;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-top: 0.85rem;
    border-radius: 9999px;
    background: #c44569;
    color: #fff0f4;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    transition: opacity 160ms ease, transform 120ms ease;
  }
  .quest-composer-cta:active:not(:disabled) {
    transform: scale(0.985);
  }
  .quest-composer-cta:disabled {
    opacity: 0.35;
  }
  .quest-composer-cta-secondary {
    margin-top: 0;
    background: transparent;
    color: #3f454c;
    box-shadow: inset 0 0 0 1px rgba(63, 69, 76, 0.18);
  }
  .quest-composer-cta-ghost {
    margin-top: 0;
    background: transparent;
    color: #3f454c;
    box-shadow: inset 0 0 0 1px rgba(63, 69, 76, 0.22);
  }
  .quest-composer-hint {
    margin-top: 0.65rem;
    font-size: 12px;
    line-height: 1.35;
    color: rgba(63, 69, 76, 0.5);
  }
  .quest-composer-error {
    margin-top: 0.65rem;
    font-size: 12px;
    color: #a83223;
  }
`;

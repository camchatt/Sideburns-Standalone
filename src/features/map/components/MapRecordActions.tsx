import { useEffect, useState } from "react";
import type { LocalInteraction, LocalInteractionRepository, PlayaMapRecord } from "@/features/map/types/mapRecord";
import { SaveIcon, ShareIcon, StarIcon } from "@/features/map/components/InteractionIcons";

export function MapRecordActions({ record, repository }: { record: PlayaMapRecord; repository: LocalInteractionRepository }) {
  const [state, setState] = useState<LocalInteraction>({ liked: false, saved: false, updatedAt: "" });
  const [message, setMessage] = useState("");
  useEffect(() => { let active = true; void repository.get(record.id).then((value) => active && setState(value)); return () => { active = false; }; }, [record.id, repository]);
  const share = async () => {
    const url = new URL(window.location.href); url.searchParams.set("record", record.slug);
    try {
      if (navigator.share) await navigator.share({ title: record.title, text: record.description, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setMessage("Link copied"); }
    } catch (error) { if (error instanceof Error && error.name !== "AbortError") setMessage("Share unavailable"); }
  };
  const button = "inline-flex h-11 w-11 items-center justify-center border border-[#17130f]/20 hover:bg-[#17130f]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17130f]";
  return <div className="mt-4 flex items-center gap-1 text-[#17130f]">
    <button className={button} aria-label={state.liked ? "Unlike" : "Like"} aria-pressed={state.liked} onClick={() => void repository.toggleLike(record.id).then(setState)}><StarIcon className="h-5 w-5" filled={state.liked}/></button>
    <button className={button} aria-label={state.saved ? "Remove save" : "Save"} aria-pressed={state.saved} onClick={() => void repository.toggleSaved(record.id).then(setState)}><SaveIcon className="h-5 w-5" filled={state.saved}/></button>
    <button className={button} aria-label="Share" onClick={() => void share()}><ShareIcon className="h-5 w-5"/></button>
    {message ? <span className="ml-2 text-xs text-[#17130f]/70" role="status">{message}</span> : null}
  </div>;
}

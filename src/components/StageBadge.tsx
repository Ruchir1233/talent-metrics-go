import { cn } from "@/lib/utils";
import { STAGE_BADGE_CLASS } from "@/lib/supabase";

export function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_BADGE_CLASS[stage] ?? STAGE_BADGE_CLASS.Submitted;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        cls,
      )}
    >
      {stage}
    </span>
  );
}

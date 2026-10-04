import type { ClipItem, DeliveryIssue } from "@/types/api";

const DELIVERY_ISSUE_LABELS: Record<DeliveryIssue, string> = {
  cut_off: "Cut off",
  starts_late: "Starts late",
  missing_words: "Missing words",
  misstatement: "Misstatement",
};

export function clipIssueLabel(clip: ClipItem | null | undefined): string | null {
  if (!clip) return null;
  if (clip.falseStart) return "False start";
  if (!clip.deliveryIssue) return null;
  return DELIVERY_ISSUE_LABELS[clip.deliveryIssue] ?? null;
}

export function clipHasIssue(clip: ClipItem | null | undefined): boolean {
  return clipIssueLabel(clip) != null;
}

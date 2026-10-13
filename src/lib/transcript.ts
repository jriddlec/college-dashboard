import "server-only";
import { z } from "zod";
import { readConfig } from "@/lib/config";
import type { Transcript } from "@/lib/school/gpa";

const TranscriptSchema = z.object({
  gpaHours: z.number().nonnegative(),
  qualityPoints: z.number().nonnegative(),
  inProgress: z.array(z.object({ code: z.string(), credits: z.number().positive() })).default([]),
});

/**
 * Completed-term GPA totals live in $CONFIG_DIR/transcript.json (copied by
 * hand from the unofficial transcript). Null when absent or invalid — the GPA
 * widget then stays "not connected".
 */
export async function getTranscript(): Promise<Transcript | null> {
  return (await readConfig("transcript.json", TranscriptSchema.nullable(), null)).value;
}

import { readSessionUserId } from "@/lib/session";
import { BackendError, transcribeClip } from "@/lib/backend";
import { hit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/origin";

/**
 * One recorded clip (the request body is the raw audio) to text. Signed-in users only. The
 * audio goes straight to the engine and is not saved here.
 */

const MAX_BYTES = 1_500_000;
const TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"]);

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  // Route handlers get no built-in CSRF check, and every clip can cost money.
  if (!sameOrigin(request)) return fail(403, "Not allowed");
  const userId = await readSessionUserId();
  if (!userId) return fail(401, "Sign in again to use voice.");
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.has(type)) return fail(415, "That recording format isn't supported. Type instead.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return fail(413, "That recording is too long.");
  if (!hit(`voice:${userId}`, 40, 60 * 60 * 1000).ok) return fail(429, "That's a lot of recordings this hour. Type instead.");

  const audio = await request.arrayBuffer();
  if (!audio.byteLength) return fail(400, "The recording was empty.");
  if (audio.byteLength > MAX_BYTES) return fail(413, "That recording is too long.");
  try {
    return Response.json(await transcribeClip(userId, audio, type));
  } catch (err) {
    if (!(err instanceof BackendError)) throw err;
    if (err.status === 429) return fail(429, "You've reached the voice limit. Type instead.");
    return fail(502, "Couldn't turn that into text. Try again, or type.");
  }
}

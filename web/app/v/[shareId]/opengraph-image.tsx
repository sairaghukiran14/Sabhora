import { ImageResponse } from "next/og";
import { getPublicRun } from "@/lib/dal";
import { sharePreview } from "@/lib/share";
import { OG_SIZE, OgCard } from "@/components/og/Card";

export const alt = "A Sabhora verdict";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The picture shown when a share link is pasted into WhatsApp, LinkedIn or X. A private or
 * unknown link gets the plain brand card, so the image never leaks a run the page hides. */
export default async function Image({ params }: { params: Promise<{ shareId: string }> }) {
  const run = await getPublicRun((await params).shareId);
  const card = run
    ? <OgCard {...sharePreview(run)} />
    : <OgCard title="Hear the doubts before you build." line="AI investors, a simulated Indian crowd and landing-page reviewers." />;
  return new ImageResponse(card, size);
}

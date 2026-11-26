import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/components/og/Card";

export const alt = "Sabhora: hear the doubts before you build";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Default link preview for every page without its own (the landing page, terms...). */
export default function Image() {
  return new ImageResponse(
    <OgCard
      title="Hear the doubts before you build."
      line="Pitch to AI investors, hear from up to 100 simulated Indian personas, and get your landing page critiqued."
    />,
    size,
  );
}

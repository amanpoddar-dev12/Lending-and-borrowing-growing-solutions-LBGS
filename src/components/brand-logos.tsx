import sanjivani from "@/assets/sanjivani-logo.png.asset.json";
import { cn } from "@/lib/utils";

export const SANJIVANI_LOGO_URL = sanjivani.url;

/** Sanjivani co-brand mark shown beside the LBGS badge. */
export function SanjivaniLogo({ className, height = 32 }: { className?: string; height?: number }) {
  return (
    <img
      src={sanjivani.url}
      alt="Sanjivani — since 1975"
      style={{ height, width: "auto" }}
      className={cn("object-contain", className)}
    />
  );
}

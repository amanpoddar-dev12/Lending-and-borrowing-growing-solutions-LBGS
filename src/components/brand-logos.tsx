import sanjivani from "@/assets/sanjivani-logo.png.asset.json";
import { cn } from "@/lib/utils";

export const SANJIVANI_LOGO_URL = sanjivani.url;

/** Sanjivani co-brand mark shown beside the LBGS badge. */
export function SanjivaniLogo({ className }: { className?: string }) {
  return (
    <img
      src={sanjivani.url}
      alt="Sanjivani — since 1975"
      width={480}
      height={323}
      className={cn("h-8 w-auto object-contain", className)}
    />
  );
}

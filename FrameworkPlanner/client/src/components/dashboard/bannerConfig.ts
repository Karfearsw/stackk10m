import banner1 from "@assets/d199ae88-7727-4c89-9b40-70b0d779ba41_1764244434725.png";
import banner2 from "@assets/14cd99f0-0520-461a-9bab-2ef4d575e651 (1)_1764244434726.png";
import banner3 from "@assets/fac383a9-5eb3-4f1f-879e-5a8035b6d3c7 (1)_1764244434728.png";
import banner4 from "@assets/3963cd8c (1)_1764244434728.png";
import banner5 from "@assets/b8ea7ed5-2ba5-44b1-a73d-b1b73ea26b3d (1)_1764244434728.png";
import banner6 from "@assets/9402bce5-3c31-480a-b204-8a0d501032c7 (1)_1764244434729.png";
import banner7 from "@assets/a9abe541-7697-4dd5-8a56-3445face39e4_1764244434729.png";

export interface BannerImageConfig {
  key: string;
  url: string;
  active: boolean;
}

export interface BannerConfig {
  enabled: boolean;
  images: BannerImageConfig[];
}

export const DEFAULT_BANNER_IMAGES: BannerImageConfig[] = [
  { key: "default-1", url: banner1, active: true },
  { key: "default-2", url: banner2, active: true },
  { key: "default-3", url: banner3, active: true },
  { key: "default-4", url: banner4, active: true },
  { key: "default-5", url: banner5, active: true },
  { key: "default-6", url: banner6, active: true },
  { key: "default-7", url: banner7, active: true },
];

/**
 * Resolve the effective banner configuration for a user.
 * - If a stored config exists, it fully defines the banner (this is how default
 *   images can be removed, reordered, disabled, or the banner hidden).
 * - Otherwise fall back to the defaults plus any legacy custom images.
 */
export function resolveBannerConfig(
  stored: BannerConfig | null | undefined,
  legacyCustomImages: string[] | undefined,
): BannerConfig {
  if (stored && Array.isArray(stored.images)) {
    return {
      enabled: stored.enabled !== false,
      images: stored.images.filter((i) => i && typeof i.url === "string"),
    };
  }
  const custom = (legacyCustomImages || []).map((url, index) => ({
    key: `custom-${index}`,
    url,
    active: true,
  }));
  return { enabled: true, images: [...DEFAULT_BANNER_IMAGES, ...custom] };
}

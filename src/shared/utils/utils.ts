import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeGender(gender: string | number | null | undefined): string {
  const genderMap: Record<string, string> = {
    男性: "male",
    女性: "female",
    男: "male",
    女: "female",
    中性: "other",
    无性别: "other",
    双性: "other",
    其他: "other",
    male: "male",
    female: "female",
    other: "other",
    unknown: "unknown",
  };
  return genderMap[String(gender)] || "unknown";
}

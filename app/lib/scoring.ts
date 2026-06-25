export { letterGrade } from "./doctor-analysis";

export function gradeColors(score: number) {
  if (score >= 80) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      ring: "border-emerald-400",
      bar: "bg-emerald-500",
    };
  }

  if (score >= 60) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      ring: "border-amber-400",
      bar: "bg-amber-400",
    };
  }

  return {
    text: "text-red-600 dark:text-red-400",
    ring: "border-red-400",
    bar: "bg-red-500",
  };
}

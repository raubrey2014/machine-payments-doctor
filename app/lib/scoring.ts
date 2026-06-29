export { letterGrade } from "./doctor-analysis";

export function gradeColors(score: number) {
  if (score >= 80) {
    return {
      text: "text-emerald-400",
      ring: "border-emerald-500",
      bar: "bg-emerald-500",
    };
  }

  if (score >= 60) {
    return {
      text: "text-amber-400",
      ring: "border-amber-500",
      bar: "bg-amber-400",
    };
  }

  return {
    text: "text-red-400",
    ring: "border-red-500",
    bar: "bg-red-500",
  };
}

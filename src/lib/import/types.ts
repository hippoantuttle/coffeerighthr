export const mappingTargets = [
  "ignore",
  "submittedAt",
  "consent",
  "name",
  "major",
  "studentNumber",
  "grade",
  "gender",
  "birthDate",
  "email",
  "phone",
  "interests",
  "source",
  "interviewAvailability",
  "sessionConfirmation",
  "otMtReason",
  "answerMotivation",
  "answerActivity",
  "answerCollaboration",
  "extra",
] as const;
export type MappingTarget = (typeof mappingTargets)[number];

export interface ColumnMapping {
  header: string;
  target: MappingTarget;
  confidence: "high" | "medium" | "low";
}
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}
export interface ImportPreviewRow {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  status: "new" | "existing" | "changed" | "invalid";
  errors: string[];
  sourceHash: string;
}

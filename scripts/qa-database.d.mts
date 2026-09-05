import type { PGlite } from "@electric-sql/pglite";
export const recruitmentId: string;
export const applicantId: string;
export const documentCriterion: string;
export function createQaDatabase(): Promise<PGlite>;

export type ArchiveType = "document_final" | "interview_final" | "full_final";

export type InterviewReviewStatus = "draft" | "submitted";

export interface InterviewAggregate {
  average: number;
  min: number;
  max: number;
  count: number;
  highVariance: boolean;
}

export type DocumentStatus =
  | "pending"
  | "reviewing"
  | "hold"
  | "interview"
  | "rejected";

export type FinalStatus =
  | "pending"
  | "accepted"
  | "waitlisted"
  | "rejected"
  | "hold";

export interface ReviewerIdentity {
  reviewerId: string;
  reviewerName: string;
}

export interface ApplicantImportRow {
  submittedAt?: string;
  name: string;
  email: string;
  phone?: string;
  major?: string;
  studentNumber?: string;
  grade?: string;
  gender?: string;
  birthDate?: string;
  interests?: string[];
  interviewAvailability?: string;
  answers: Array<{ question: string; answer: string }>;
}

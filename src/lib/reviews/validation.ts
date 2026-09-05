import { z } from "zod";

export const reviewInput = z.object({
  reviewerId: z.string().trim().min(1).max(200),
  reviewerName: z.string().trim().min(1).max(100),
  status: z.enum(["draft", "submitted"]),
  comment: z.string().max(30000).default(""),
  scores: z.record(z.string().uuid(), z.number().int().min(1).max(5)),
});

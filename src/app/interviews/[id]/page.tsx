import InterviewClient from "./InterviewClient";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InterviewClient applicantId={id} />;
}

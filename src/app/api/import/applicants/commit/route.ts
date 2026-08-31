import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { transformRow } from "@/lib/import/transform";
import { validateApplicant } from "@/lib/import/validate";
import { applicantFingerprint } from "@/lib/import/fingerprint";
import { classifyApplicant } from "@/lib/import/classify";
import { cohortNumber, normalizeDate, normalizeGoogleFormTimestamp } from "@/lib/import/normalize";
import type { ColumnMapping } from "@/lib/import/types";

function nextCode(cohort:string,n:number){return `C${cohortNumber(cohort)}-${String(n).padStart(3,"0")}`;}

export async function POST(req:Request){
  try{
    const {recruitmentId,rows,mappings}=await req.json() as {recruitmentId:string;rows:Record<string,string>[];mappings:ColumnMapping[]};
    if(!recruitmentId) return NextResponse.json({error:"recruitmentId가 필요합니다."},{status:400});
    const supabase=createServerSupabase();
    const [{data:recruitment,error:rErr},{data:existing,error:eErr}]=await Promise.all([
      supabase.from("recruitments").select("id,cohort").eq("id",recruitmentId).single(),
      supabase.from("applicants").select("id,email,phone,source_hash,applicant_code").eq("recruitment_id",recruitmentId)
    ]);
    if(rErr) throw rErr; if(eErr) throw eErr;
    const nums=(existing??[]).map(x=>Number((x.applicant_code.match(/-(\d+)$/)?.[1])??0));
    let sequence=Math.max(0,...nums)+1;
    const output=[];
    for(let i=0;i<rows.length;i++){
      const applicant=transformRow(rows[i],mappings);
      const errors=validateApplicant(applicant);
      const sourceHash=await applicantFingerprint(applicant);
      const cls=classifyApplicant(applicant,sourceHash,existing??[],errors);
      if(cls.state==="invalid"||cls.state==="existing"){output.push({rowNumber:i+2,state:cls.state,errors});continue;}
      const base={
        recruitment_id:recruitmentId,name:applicant.name,email:applicant.email,phone:applicant.phone||null,major:applicant.major||null,
        student_number:applicant.studentNumber||null,grade:applicant.grade||null,gender:applicant.gender||null,birth_date:normalizeDate(applicant.birthDate),
        interests:applicant.interests,interview_availability:applicant.interviewAvailability||null,source_submitted_at:normalizeGoogleFormTimestamp(applicant.submittedAt),source_hash:sourceHash,
        consent_text:applicant.consent||null,application_source:applicant.source||null,session_confirmation:applicant.sessionConfirmation||null,ot_mt_reason:applicant.otMtReason||null,
        source_data:applicant.raw,extra_fields:applicant.extras,updated_at:new Date().toISOString()
      };
      let applicantId=cls.existingId;
      if(cls.state==="new"){
        const applicantCode=nextCode(recruitment.cohort,sequence++);
        const {data,error}=await supabase.from("applicants").insert({...base,applicant_code:applicantCode}).select("id").single(); if(error) throw error; applicantId=data.id;
      } else {
        const {error}=await supabase.from("applicants").update(base).eq("id",applicantId!); if(error) throw error;
        await supabase.from("application_answers").delete().eq("applicant_id",applicantId!);
      }
      if(applicant.answers.length){
        const {error}=await supabase.from("application_answers").insert(applicant.answers.map((a,idx)=>({applicant_id:applicantId,question_key:a.key,question_label:a.question,answer:a.answer,sort_order:idx})));
        if(error) throw error;
      }
      output.push({rowNumber:i+2,state:cls.state,errors:[]});
    }
    return NextResponse.json({ok:true,rows:output});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"가져오기 실패"},{status:500});}
}

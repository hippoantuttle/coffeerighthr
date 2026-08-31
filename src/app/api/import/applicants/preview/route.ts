import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { transformRow } from "@/lib/import/transform";
import { validateApplicant } from "@/lib/import/validate";
import { applicantFingerprint } from "@/lib/import/fingerprint";
import { classifyApplicant } from "@/lib/import/classify";
import type { ColumnMapping } from "@/lib/import/types";

export async function POST(req:Request){
  try{
    const {recruitmentId,rows,mappings}=await req.json() as {recruitmentId:string;rows:Record<string,string>[];mappings:ColumnMapping[]};
    if(!recruitmentId) return NextResponse.json({error:"recruitmentId가 필요합니다."},{status:400});
    const supabase=createServerSupabase();
    const {data:existing,error}=await supabase.from("applicants").select("id,email,phone,source_hash,applicant_code").eq("recruitment_id",recruitmentId);
    if(error) throw error;
    const result=[];
    for(let i=0;i<rows.length;i++){
      const applicant=transformRow(rows[i],mappings);
      const errors=validateApplicant(applicant);
      const sourceHash=await applicantFingerprint(applicant);
      const classified=classifyApplicant(applicant,sourceHash,existing??[],errors);
      result.push({rowNumber:i+2,name:applicant.name,email:applicant.email,phone:applicant.phone,sourceHash,errors,...classified});
    }
    const summary=result.reduce((a,r)=>{a[r.state]++;return a;},{new:0,existing:0,changed:0,invalid:0} as Record<string,number>);
    return NextResponse.json({summary,rows:result});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"미리보기 생성 실패"},{status:500});}
}

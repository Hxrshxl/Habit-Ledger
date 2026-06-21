import { NextRequest, NextResponse } from "next/server";
import { listJobs, createJob } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const { company, role, status } = body;
  if (!company?.trim()) return NextResponse.json({ error: "Company is required." }, { status: 400 });
  if (!role?.trim()) return NextResponse.json({ error: "Role is required." }, { status: 400 });
  if (!status?.trim()) return NextResponse.json({ error: "Status is required." }, { status: 400 });

  const job = await createJob({
    company: company.trim(),
    role: role.trim(),
    status: status.trim(),
    date_applied: body.date_applied ?? null,
    referral: Boolean(body.referral),
    referral_contact: body.referral_contact?.trim() ?? "",
    salary: body.salary?.trim() ?? "",
    job_link: body.job_link?.trim() ?? "",
    notes: body.notes?.trim() ?? "",
  });
  return NextResponse.json(job, { status: 201 });
}

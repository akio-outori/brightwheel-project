import { cookies } from "next/headers";
import OperatorDashboard from "@/components/operator/OperatorDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Auto-set the staff cookie so the demo works without a login step.
  // The middleware checks this cookie on protected write routes.
  const token = process.env.STAFF_AUTH_TOKEN;
  if (token) {
    const jar = await cookies();
    jar.set("brightdesk-staff-token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return <OperatorDashboard />;
}

import { handleFairTraffic } from "@/lib/fair-server/sharing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairTraffic(request);
}

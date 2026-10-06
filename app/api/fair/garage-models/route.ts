import { handleFairGarageModels } from "@/lib/fair-server/garage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFairGarageModels(request);
}

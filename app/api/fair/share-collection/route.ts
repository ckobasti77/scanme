import { handleCreateShareCollection } from "@/lib/fair-server/sharing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateShareCollection(request);
}

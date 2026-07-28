"use server";

import { redirect } from "next/navigation";
import { grantPreviewAccess, isValidPreviewPasskey } from "@/lib/preview-access";

export async function unlockPreview(formData: FormData) {
  const passkey = formData.get("passkey");

  if (typeof passkey !== "string" || !isValidPreviewPasskey(passkey)) {
    redirect("/preview-login?error=invalid");
  }

  await grantPreviewAccess();
  redirect("/");
}

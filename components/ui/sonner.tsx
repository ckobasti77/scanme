"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return <Sonner position="bottom-right" richColors closeButton {...props} />;
}

export { Toaster };

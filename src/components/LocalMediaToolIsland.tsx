"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// A client-side dynamic boundary keeps this code out of unrelated content pages.
// SSR stays enabled so the file controls and initial dimensions remain available.
const Tool = dynamic(() => import("./LocalMediaTool").then(module => module.LocalMediaTool));
export function LocalMediaToolIsland(props: ComponentProps<typeof import("./LocalMediaTool").LocalMediaTool>) {
  return <Tool {...props} />;
}

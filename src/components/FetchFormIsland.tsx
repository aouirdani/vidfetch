"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Keep SSR while giving the shared catch-all route a separate interactive bundle.
const Form = dynamic(() => import("./FetchForm").then(module => module.FetchForm));
export function FetchFormIsland(props: ComponentProps<typeof import("./FetchForm").FetchForm>) {
  return <Form {...props} />;
}

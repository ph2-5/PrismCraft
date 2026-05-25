"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function CreatePage() {
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      router.replace("/story");
    }
  }, [router]);

  return null;
}

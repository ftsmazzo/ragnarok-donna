"use client";

import { useEffect, useRef } from "react";
import { persistStaffSessionAction } from "@/app/(painel)/persist-staff-session-action";

/** Uma vez por montagem: grava staffId no cookie se o JWT ainda estiver sem vínculo. */
export function PersistStaffSession({ needsPersist }: { needsPersist: boolean }) {
  const ran = useRef(false);

  useEffect(() => {
    if (!needsPersist || ran.current) return;
    ran.current = true;
    void persistStaffSessionAction();
  }, [needsPersist]);

  return null;
}

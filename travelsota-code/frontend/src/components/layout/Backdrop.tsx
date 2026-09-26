"use client";

import { useSidebar } from "@/components/ui/sidebar";
import React from "react";

const Backdrop: React.FC = () => {
  const { openMobile, setOpenMobile } = useSidebar();

  if (!openMobile) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
      onClick={() => setOpenMobile(false)}
    />
  );
};

export default Backdrop;

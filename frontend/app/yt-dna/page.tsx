"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

function YtDnaErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const agentId = searchParams.get("agentId");

  return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-6">
      <div className="text-6xl">⚠️</div>
      <h1 className="text-2xl font-bold text-red-500">YouTube DNA Initialization Failed</h1>
      <p className="text-text-secondary">{error || "An unknown error occurred during OAuth."}</p>
      <div className="pt-4">
        {agentId ? (
          <Link href={`/agent/${agentId}`}>
            <Button>Return to Agent Profile</Button>
          </Link>
        ) : (
          <Link href="/dashboard">
            <Button>Return to Dashboard</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function YtDnaErrorPage() {
  return (
    <Suspense fallback={<div className="text-center mt-20">Loading...</div>}>
      <YtDnaErrorContent />
    </Suspense>
  );
}

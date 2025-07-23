"use client";
import { ModeToggle } from "@/components/toggle-button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-7xl font-bold">HWSphere home page</h1>
      <p className="text-lg mt-4">
        Welcome to the HWSphere home page! This is a simple 3D web application.
      </p>


    {/* Dark mode toggle test */}
    <ModeToggle />

    </div>
  );
}

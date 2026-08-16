import { Dashboard } from "@/components/dashboard";

// Render at request time so the RPC endpoint and mode reflect the runtime
// .env (not whatever was present at build time, e.g. inside a Docker image).
export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard />;
}

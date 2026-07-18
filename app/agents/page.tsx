import { redirect } from "next/navigation";

// /agents is the human-clickable entry ("Setup for Agents" button); the
// rendered doc lives in the docs shell. Agents themselves fetch the raw
// markdown at /agents.md (see /llms.txt).
export default function AgentsRedirect() {
  redirect("/docs/agents");
}

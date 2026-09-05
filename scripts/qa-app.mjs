import { spawn } from "node:child_process";
const env = {
  ...process.env,
  SUPABASE_URL: "http://127.0.0.1:54329",
  SUPABASE_SERVICE_ROLE_KEY: "local-qa-only",
  NEXT_PUBLIC_RECRUITMENT_ID: "00000000-0000-4000-8000-000000000001",
};
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  { env, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));

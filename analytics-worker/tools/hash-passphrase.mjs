#!/usr/bin/env node
/* Turn the dashboard passphrase into the two Worker secrets the service
 * stores. Run it on your own machine and type the passphrase at the prompt;
 * it is never written to disk, a shell history, or this repository.
 *
 *   npm run hash-passphrase
 *
 * Then, in analytics-worker/:
 *   npx wrangler secret put ADMIN_PASSPHRASE_HASH
 *   npx wrangler secret put ADMIN_PASSPHRASE_SALT
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

/* Cloudflare Workers WebCrypto caps PBKDF2 at 100,000 iterations. */
export const ITERATIONS = 100_000;

export function hashPassphrase(passphrase, saltHex, iterations = ITERATIONS) {
  const salt = Buffer.from(saltHex, "hex");
  return pbkdf2Sync(passphrase.normalize("NFKC"), salt, iterations, 32, "sha256").toString("base64");
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const onData = (char) => {
      if (["\r", "\n", "\u0004"].includes(String(char))) return;
      stdout.clearLine(0);
      stdout.cursorTo(0);
      stdout.write(question);
    };
    stdout.write(question);
    stdin.on("data", onData);
    rl.question("", (answer) => {
      stdin.off("data", onData);
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const passphrase = await askHidden("Dashboard passphrase: ");
  if (passphrase.length < 12) {
    console.error("Refusing: use at least 12 characters. A long phrase beats a short, clever password.");
    process.exitCode = 1;
    return;
  }
  const confirm = await askHidden("Confirm passphrase:  ");
  if (confirm !== passphrase) {
    console.error("Refusing: the two entries do not match.");
    process.exitCode = 1;
    return;
  }
  const saltHex = randomBytes(16).toString("hex");
  console.log("\nSet these two Worker secrets, in this order:\n");
  console.log(`ADMIN_PASSPHRASE_SALT=${saltHex}`);
  console.log(`ADMIN_PASSPHRASE_HASH=${hashPassphrase(passphrase, saltHex)}`);
  console.log(`\n(iterations: ${ITERATIONS}, salt bytes: 16, output: base64 SHA-256)`);
  console.log("Store the passphrase in your password manager. It cannot be recovered from these values.");
}

if (process.argv[1] && process.argv[1].endsWith("hash-passphrase.mjs")) {
  main();
}

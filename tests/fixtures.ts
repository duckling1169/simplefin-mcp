import { readFileSync } from "node:fs";

/** Load a fresh fixture value so mutations in a test never affect another test. */
export function loadFixture(name: string): unknown {
  const body = readFileSync(
    new URL(`./fixtures/${name}`, import.meta.url),
    "utf8",
  );
  const fixture: unknown = JSON.parse(body);
  return fixture;
}

// Minimal typing so TypeScript stops complaining even if Node types aren't loaded.
declare const process: { env: Record<string, string | undefined> };

export function env(name: string): string | undefined {
  return process?.env?.[name];
}

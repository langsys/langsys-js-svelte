/**
 * The contract double (`contract-fixture/server.mjs`) in a process of its own, for a test file
 * that drives the core against it. This repo carries no Node types, so the child's shape is
 * stated here, and `node:child_process` is loaded at run time, as kit/server.ts loads
 * `node:async_hooks`.
 */
interface Child {
    stdout: { on(event: 'data', listener: (chunk: Uint8Array) => void): void };
    kill(): void;
}

export interface Double {
    /** The API base URL to hand the core. */
    base: string;
    /** The double's own routes: `/seed`, `/state`. */
    fixture: string;
    /** Replace the double's state with `seed`. */
    seed(seed: unknown): Promise<void>;
    stop(): void;
}

export async function startDouble(seed: unknown): Promise<Double> {
    const id = 'node:child_process';
    const { spawn } = (await import(/* @vite-ignore */ id)) as { spawn: (command: string, args: string[]) => Child };
    const { execPath } = (globalThis as unknown as { process: { execPath: string } }).process;
    const child = spawn(execPath, ['contract-fixture/server.mjs']);
    // The double's first line on stdout names its two URLs.
    const line = await new Promise<string>((resolve) => {
        let out = '';
        child.stdout.on('data', (chunk) => {
            out += new TextDecoder().decode(chunk);
            if (out.includes('\n')) resolve(out.slice(0, out.indexOf('\n')));
        });
    });
    const { base_url: base, fixture_url: fixture } = JSON.parse(line) as { base_url: string; fixture_url: string };
    const double: Double = {
        base,
        fixture,
        seed: async (state) => {
            const res = await fetch(`${fixture}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
            if (!res.ok) throw new Error(`the contract double refused the seed: ${res.status} ${await res.text()}`);
        },
        stop: () => child.kill(),
    };
    await double.seed(seed);
    return double;
}

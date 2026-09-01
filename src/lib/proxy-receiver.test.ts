import { describe, expect, it } from 'vitest';

/**
 * The `#private` trap, pinned with a control that fails first.
 *
 * The core class carries no `#private` fields today — a structural scan says so,
 * and that scan is itself controlled below. But "none today" is not a property
 * anyone can rely on, and the failure mode if one appears is nasty: a Proxy that
 * forwards with itself as the receiver throws `TypeError: Cannot read private
 * member` on the first access, from inside the core, with a stack that points
 * nowhere near the binding.
 *
 * So the guard is written against a FIXTURE that has the field the core does not.
 * The first test shows the naive Proxy genuinely failing — a control that has
 * never been observed failing is a hypothesis — and the second shows the shape
 * this binding actually ships passing the same fixture.
 */
class FixtureWithPrivate {
    #secret = 42;
    reveal(): number {
        return this.#secret;
    }
    get doubled(): number {
        return this.#secret * 2;
    }
}

/** What NOT to do: receiver defaults to the proxy, so `#secret` is not found. */
const naiveProxy = <T extends object>(target: T): T =>
    new Proxy(target, {
        get(t, p, receiver) {
            return Reflect.get(t, p, receiver); // ← receiver is the PROXY
        },
    });

/** The shape shipped in index.ts: receiver is the target, functions bound to it. */
const shippedProxy = <T extends object>(target: T): T =>
    new Proxy(target, {
        get(t, p) {
            const value = Reflect.get(t, p, t); // ← receiver is the TARGET
            return typeof value === 'function' ? value.bind(t) : value;
        },
    });

describe('#private forwarding — the control fails before it passes', () => {
    const fixture = new FixtureWithPrivate();

    it('control: the fixture really does have a private field to lose', () => {
        expect(fixture.reveal()).toBe(42);
        expect(fixture.doubled).toBe(84);
    });

    it('NAIVE proxy breaks private access through a getter (this is the trap)', () => {
        const bad = naiveProxy(fixture);
        // A getter runs with the receiver as `this`; the proxy has no #secret.
        expect(() => bad.doubled).toThrow(TypeError);
    });

    it('NAIVE proxy breaks private access through a method too', () => {
        const bad = naiveProxy(fixture);
        // The method is returned unbound, so `this` is the proxy at call time.
        expect(() => bad.reveal()).toThrow(TypeError);
    });

    it('SHIPPED proxy shape forwards private access correctly — getter', () => {
        expect(shippedProxy(fixture).doubled).toBe(84);
    });

    it('SHIPPED proxy shape forwards private access correctly — method', () => {
        expect(shippedProxy(fixture).reveal()).toBe(42);
    });

    it('SHIPPED proxy survives destructuring, which is where binding matters', () => {
        const { reveal } = shippedProxy(fixture);
        expect(reveal()).toBe(42);
    });
});

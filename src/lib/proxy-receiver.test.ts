import { describe, expect, it } from 'vitest';
import { createForwardingHandler } from './proxy-handler.js';

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

/**
 * THE SHIPPED HANDLER — imported, never re-declared.
 *
 * An earlier version of this file re-implemented the handler locally. The copy
 * agreed with `index.ts` until they diverged, and then hid exactly the bug this
 * file exists to catch: mutating the real handler to forward with the proxy as
 * receiver left all 100 tests green, because the fixture was checking its own
 * copy. Importing it is the whole point.
 */
const shippedProxy = <T extends object>(target: T): T => new Proxy(target, createForwardingHandler<T, Record<string, never>>({}));

describe('#private forwarding — the SHIPPED handler, with a control that fails first', () => {
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

/**
 * Accessor values are values, not methods — they are never bound.
 *
 * The handler used to bind every function it handed out. That is right for a
 * method and wrong for a function a getter RETURNS: the core's `t` getter hands out
 * the current `TFunction`, whose identity is the reactivity contract, and binding
 * it produced a different function on every read. Pinned against a fixture with the
 * same shape, with a bind-everything proxy as the control that has to fail first.
 */
class FixtureWithAccessor {
    #current = function current(): string {
        return 'value';
    };
    get current(): () => string {
        return this.#current;
    }
    method(): this {
        return this;
    }
}

/** The shape shipped before the accessor check: every function bound. */
const bindEverythingProxy = <T extends object>(target: T): T =>
    new Proxy(target, {
        get(t, p) {
            const v = Reflect.get(t, p, t);
            return typeof v === 'function' ? v.bind(t) : v;
        },
    });

describe('accessor values — forwarded unbound by the SHIPPED handler, with a control that fails first', () => {
    const fixture = new FixtureWithAccessor();

    it('control: the fixture getter returns the SAME function on every read', () => {
        expect(fixture.current).toBe(fixture.current);
    });

    it('BIND-EVERYTHING proxy breaks accessor identity (the defect)', () => {
        const bad = bindEverythingProxy(fixture);
        expect(bad.current).not.toBe(bad.current);
    });

    it('SHIPPED handler: an accessor value is the target’s own value, read after read', () => {
        const proxied = shippedProxy(fixture);
        expect(proxied.current).toBe(fixture.current);
        expect(proxied.current).toBe(proxied.current);
    });

    it('SHIPPED handler: a method is still bound to the target', () => {
        const { method } = shippedProxy(fixture);
        expect(method()).toBe(fixture);
    });
});

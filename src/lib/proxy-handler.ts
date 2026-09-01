/**
 * The forwarding handler used by the `LangsysApp` proxy — extracted so tests
 * exercise **the shipped code** rather than a re-implementation of it.
 *
 * It was previously inline in `index.ts`, with the `#private` fixture test
 * asserting against a locally re-declared copy of the same shape. That copy
 * agreed with the shipped handler right up until they diverged: mutating
 * `index.ts` to forward with the PROXY as receiver — the exact bug the fixture
 * exists to catch — left the whole suite green, because the fixture was testing
 * its own copy. A verifier that restates the implementation cannot fail with it.
 */

/** Receiver rule, and why it is the target rather than the proxy.
 *
 * A getter or a `#private` read runs with the receiver as `this`. Forward with
 * the proxy as receiver and the core looks for its own fields on an object that
 * does not have them: `TypeError: Cannot read private member`, thrown from
 * inside the core, with a stack pointing nowhere near this binding.
 *
 * The core has no `#private` fields today — measured, with a control — but that
 * is a property of the core at one commit, not a guarantee. Binding to the
 * target is safe either way, which is why it is the shape shipped here. The
 * trade-off is real and deliberate: binding means a forwarded function is not
 * `===` the core's own, so identity assertions must be about runtime forwarding
 * rather than reference equality.
 */
export function createForwardingHandler<T extends object, O extends object>(overrides: O): ProxyHandler<T> {
    return {
        get(target, prop) {
            // `Object.hasOwn`, not `prop in overrides`: `in` walks the prototype
            // chain, so `constructor` and `__proto__` would resolve against
            // Object.prototype and be reported as overrides of ours.
            if (typeof prop === 'string' && Object.hasOwn(overrides, prop)) {
                return (overrides as Record<string, unknown>)[prop];
            }
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
        has(target, prop) {
            if (typeof prop === 'string' && Object.hasOwn(overrides, prop)) return true;
            return Reflect.has(target, prop);
        },
    };
}

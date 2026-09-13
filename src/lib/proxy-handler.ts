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
            if (typeof value !== 'function' || isAccessor(target, prop)) return value;
            return value.bind(target);
        },
        has(target, prop) {
            if (typeof prop === 'string' && Object.hasOwn(overrides, prop)) return true;
            return Reflect.has(target, prop);
        },
    };
}

/**
 * Whether `prop` resolves through a getter rather than a data property.
 *
 * A getter's result is a VALUE the core hands out, not a method of the core, so it
 * is returned as-is. `LangsysApp.t` is the case that matters: it returns the current
 * `TFunction`, and that function's identity is the reactivity contract — `Signal.set`
 * drops an `Object.is`-equal value, so a fresh function per emit is the only thing
 * that tells a subscriber anything changed. Binding it minted a new function on
 * every read: measured before this check, `core.t === core.t` held while
 * `LangsysApp.t === LangsysApp.t` did not, each read a distinct `bound fn`.
 */
function isAccessor(obj: object, prop: PropertyKey): boolean {
    for (let o: object | null = obj; o; o = Object.getPrototypeOf(o)) {
        const descriptor = Object.getOwnPropertyDescriptor(o, prop);
        if (descriptor) return 'get' in descriptor;
    }
    return false;
}

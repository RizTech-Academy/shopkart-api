/**
 * Who a basket, favourite or order belongs to.
 *
 * This is the type this codebase originally got wrong, and the mistake is
 * instructive. Baskets were keyed on a *session id* — but a session is an
 * authentication artifact. It expires, it is per-device, it is a detail of how
 * somebody proved who they are. A basket belongs to a **shopper**, and a
 * shopper is either a guest or a registered user.
 *
 * Modelling that explicitly buys three things:
 *   - the domain never learns that sessions or tokens exist
 *   - "keep the basket I built as a guest when I sign in" becomes an operation
 *     on two Owners, not SQL smuggled into a session repository
 *   - the compiler forces every call site to say which kind it is holding
 */
export type Owner =
  | { readonly kind: 'guest'; readonly sessionId: string }
  | { readonly kind: 'user'; readonly userId: string };

export const guestOwner = (sessionId: string): Owner => ({ kind: 'guest', sessionId });
export const userOwner = (userId: string): Owner => ({ kind: 'user', userId });

/**
 * The stable key an Owner is stored under.
 *
 * Discriminated so a user id can never collide with a session id, letting a
 * single indexed column serve both kinds. The prefix exists only at the
 * storage boundary — no business rule ever parses this string.
 */
export type OwnerKey = string & { readonly __brand: 'OwnerKey' };

export const ownerKey = (owner: Owner): OwnerKey =>
  (owner.kind === 'guest' ? `guest:${owner.sessionId}` : `user:${owner.userId}`) as OwnerKey;

export const sameOwner = (a: Owner, b: Owner): boolean => ownerKey(a) === ownerKey(b);

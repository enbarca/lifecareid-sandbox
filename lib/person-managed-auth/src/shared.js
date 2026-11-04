// Small helpers both halves use. No network, no state, no values.
//
// Person-managed authorization, draft 1. Every shape marked "profile draft 1
// may change this" follows what the hosted sandbox does on 2026-11-04 and may
// move when the open agent authorization profile publishes.

export const DRAFT = "draft 1";

// A base URL the library will talk to: https, or plain http on loopback for a
// server you run on your own machine. Returns the URL without a trailing slash
// on its path, or throws with a line that names the option.
export function baseUrl(value, option) {
  let u;
  try {
    u = new URL(String(value));
  } catch (_) {
    throw new TypeError(`${option} must be a URL, for example https://example.com`);
  }
  const loopback = u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !loopback) {
    throw new TypeError(`${option} must be https, or http on localhost, 127.0.0.1 or [::1] (got ${u.origin})`);
  }
  if (u.search || u.hash || u.username || u.password) {
    throw new TypeError(`${option} must not carry a query, a fragment or credentials`);
  }
  return u.origin + u.pathname.replace(/\/+$/, "");
}

export const originOf = (value) => new URL(value).origin;

// Two issuer or resource identifiers, compared as parsed URLs, tolerating one
// trailing slash on either.
export function sameUrl(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/+$/, "") === y.pathname.replace(/\/+$/, "");
  } catch (_) {
    return false;
  }
}

// A scope token as RFC 6749 section 3.3 allows it: printable ASCII without
// space, double quote or backslash. Checked at configuration time so a scope
// can never break out of a challenge header.
export function scopeToken(value, option) {
  if (typeof value !== "string" || !/^[\x21\x23-\x5B\x5D-\x7E]+$/.test(value)) {
    throw new TypeError(`${option} must be a scope name without spaces or quotes`);
  }
  return value;
}

// The key="value" pairs of a Bearer challenge (RFC 6750 section 3, RFC 9728
// section 5.1). Values only, never a token.
export function challengeParams(header) {
  const out = {};
  for (const m of String(header || "").matchAll(/([a-z_]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// profile draft 1 may change this
// The receipt: a reference and a hash, never a value. Field names are the ones
// the hosted sandbox source answers with today.
export function receiptFields({ consent_id, ledger_entry_hash, access_recorded }) {
  return {
    consent_id: typeof consent_id === "string" ? consent_id : null,
    access_recorded: access_recorded === true,
    ledger_entry_hash: typeof ledger_entry_hash === "string" ? ledger_entry_hash : null,
  };
}

// A code or a token cut to ten characters, for any line a person reads.
export const cut = (s) => (typeof s === "string" && s.length > 10 ? s.slice(0, 10) + "…" : s);

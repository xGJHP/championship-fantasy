import { describe, it, expect } from "vitest";
import { friendlyAuthError } from "../lib/auth-errors";

describe("friendly auth errors", () => {
  it("never leaks the SDK message that started all this", () => {
    const raw =
      "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.";
    const f = friendlyAuthError(raw)!;
    expect(f.message).toBe("That sign in link could not be completed.");
    const all = f.message + " " + (f.hint ?? "");
    ["PKCE", "supabase", "SvelteKit", "storage", "cookies"].forEach((word) =>
      expect(all.toLowerCase()).not.toContain(word.toLowerCase())
    );
  });

  it("explains a wrong password without saying which field was wrong", () => {
    const f = friendlyAuthError("Invalid login credentials")!;
    expect(f.message).toBe("That email and password do not match.");
  });

  it("recognises an existing account", () => {
    expect(friendlyAuthError("User already registered")!.message)
      .toBe("There is already an account with that email.");
  });

  it("points a rate limited user at passwords", () => {
    const f = friendlyAuthError("email rate limit exceeded")!;
    expect(f.message).toBe("Too many attempts just now.");
    expect(f.hint).toContain("password");
  });

  it("handles expired links and bad codes separately", () => {
    expect(friendlyAuthError("Token has expired")!.message).toBe("That link or code has expired.");
    expect(friendlyAuthError("Invalid token")!.message).toBe("That code was not right.");
  });

  it("catches unconfirmed emails", () => {
    expect(friendlyAuthError("Email not confirmed")!.message)
      .toBe("Your email address has not been confirmed yet.");
  });

  it("falls back to something harmless for anything unrecognised", () => {
    const f = friendlyAuthError("kernel panic at 0x00ff")!;
    expect(f.message).toBe("Something went wrong signing you in.");
    expect(f.message).not.toContain("0x00ff");
  });

  it("returns null when there is no error", () => {
    expect(friendlyAuthError(null)).toBeNull();
    expect(friendlyAuthError("")).toBeNull();
  });

  it("never mentions localhost, redirect allow lists or config", () => {
    const raws = [
      "PKCE code verifier not found in storage",
      "redirect_to url is not allowed",
      "Invalid login credentials",
      "something entirely unexpected",
    ];
    raws.forEach((r) => {
      const f = friendlyAuthError(r)!;
      const all = (f.message + " " + (f.hint ?? "")).toLowerCase();
      ["localhost", "allow list", "url configuration", "env"].forEach((w) =>
        expect(all).not.toContain(w)
      );
    });
  });
});

describe("short codes from the callback", () => {
  it("maps every code the callback can emit", () => {
    const codes = ["link_wrong_device", "link_expired", "link_failed", "rate_limited", "unavailable"];
    codes.forEach((c) => {
      const f = friendlyAuthError(c)!;
      expect(f.message).toBeTruthy();
      expect(f.message).not.toContain("_");
      expect(f.message).not.toBe("Something went wrong signing you in.");
    });
  });

  it("keeps handling raw client side errors too", () => {
    expect(friendlyAuthError("Invalid login credentials")!.message)
      .toBe("That email and password do not match.");
  });
});

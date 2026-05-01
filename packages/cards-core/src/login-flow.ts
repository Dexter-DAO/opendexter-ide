/**
 * High-level login orchestration.
 *
 * MoonPay protects {@link login} with hCaptcha (sitekey
 * {@link MOONPAY_HCAPTCHA_SITEKEY}). Callers need to obtain a captcha
 * response token from a real user interaction and pass it to
 * {@link LoginFlow.requestCode}. The token shape and lifecycle are
 * defined by hCaptcha:
 *
 *   - Browser flow: render the hCaptcha widget with the sitekey,
 *     attach an `onVerify` callback, and forward the token. See
 *     `@hcaptcha/react-hcaptcha` for an off-the-shelf component.
 *   - Headless flow: pop a localhost browser via `playwright` /
 *     `puppeteer`, navigate to a page that hosts the widget, await
 *     manual user solve, read the token from the page.
 *   - Service flow: pay a captcha-solving service (2captcha, anti-captcha)
 *     to solve in the background and return the token.
 *   - Partnership flow: ask MoonPay to whitelist your origin or issue
 *     a service-account credential that bypasses the captcha entirely.
 *
 * This module only orchestrates. It never reaches into the browser or
 * shells out to a third-party service — that's a caller concern.
 */

import {
  login,
  refresh,
  verify,
  type MoonPayAuthOptions,
  type SessionTokens,
  type SessionStore,
  MoonPaySession,
} from "./auth.js";

/**
 * MoonPay's production hCaptcha public sitekey for the agents.moonpay.com
 * login flow. Public information; safe to embed in clients. Verified by
 * inspection of the rendered hCaptcha iframe at agents.moonpay.com/login.
 */
export const MOONPAY_HCAPTCHA_SITEKEY = "7852220c-0796-4782-93c2-59f67b4a3744";

/** hCaptcha embed config that mirrors MoonPay's default appearance. */
export const MOONPAY_HCAPTCHA_CONFIG = Object.freeze({
  sitekey: MOONPAY_HCAPTCHA_SITEKEY,
  theme: "dark" as const,
  size: "normal" as const,
});

/**
 * Drives the full login dance: send OTP, exchange code, optionally
 * persist into a {@link SessionStore} and return a ready-to-use
 * {@link MoonPaySession}.
 *
 * Typical browser usage:
 *
 * ```ts
 * const flow = new LoginFlow();
 * await flow.requestCode({ email, captchaToken });   // user solved hCaptcha
 * const session = await flow.completeWithCode({ email, code, store });
 * const client = new MoonPayClient({ session });
 * ```
 */
export class LoginFlow {
  constructor(private readonly opts: MoonPayAuthOptions = {}) {}

  /**
   * Trigger the OTP email. Caller supplies the hCaptcha token they
   * captured from a verified user interaction.
   */
  async requestCode(input: {
    email: string;
    captchaToken: string;
  }): Promise<{ ok: true }> {
    return login(input, this.opts);
  }

  /**
   * Exchange the OTP code for a session and (optionally) persist it.
   * Returns a {@link MoonPaySession} bound to either the provided
   * store or an in-memory store.
   */
  async completeWithCode(input: {
    email: string;
    code: string;
    store?: SessionStore;
  }): Promise<{ session: MoonPaySession; tokens: SessionTokens }> {
    const tokens = await verify(
      { email: input.email, code: input.code },
      this.opts,
    );
    if (input.store) {
      await input.store.save(tokens);
      return {
        session: new MoonPaySession(input.store, this.opts),
        tokens,
      };
    }
    const memoryStore: SessionStore = {
      load: () => tokens,
      save: () => {
        /* memory only */
      },
      clear: () => {
        /* memory only */
      },
    };
    return {
      session: new MoonPaySession(memoryStore, this.opts),
      tokens,
    };
  }

  /**
   * Resume an existing session from a store. Calls refresh once to
   * confirm the stored tokens are still valid (and to roll the
   * refresh-token forward); throws if the stored refresh token is
   * dead.
   */
  async resume(store: SessionStore): Promise<MoonPaySession> {
    const stored = await store.load();
    if (!stored) {
      throw new Error("LoginFlow.resume: no session in store");
    }
    const fresh = await refresh(
      { refreshToken: stored.refreshToken },
      this.opts,
    );
    await store.save(fresh);
    return new MoonPaySession(store, this.opts);
  }
}

/**
 * Zero-dependency hCaptcha embed helper for the browser.
 *
 * Loads hCaptcha's official JS, renders a widget bound to MoonPay's
 * sitekey, and returns a Promise that resolves with the captcha token
 * when the user completes the challenge. Callers feed the token to
 * {@link LoginFlow.requestCode}.
 *
 * NOTE: This module touches `window` and `document`. It must run in a
 * browser. Callers using cards-core in Node (server-side) should NOT
 * import this module — instead, render hCaptcha however their UI
 * framework prefers and pass the resulting token to {@link login}
 * directly.
 */

import { MOONPAY_HCAPTCHA_CONFIG, MOONPAY_HCAPTCHA_SITEKEY } from "./login-flow.js";

const HCAPTCHA_SCRIPT_URL = "https://js.hcaptcha.com/1/api.js?render=explicit";
const HCAPTCHA_SCRIPT_ID = "hcaptcha-api-script";

interface HCaptchaApi {
  render: (
    container: HTMLElement,
    config: {
      sitekey: string;
      theme?: "light" | "dark";
      size?: "normal" | "compact" | "invisible";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: (err: unknown) => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi;
  }
}

let scriptPromise: Promise<HCaptchaApi> | null = null;

/**
 * Inject hCaptcha's API script if not already present. Returns the
 * `window.hcaptcha` API once it's ready.
 */
export function loadHCaptchaScript(): Promise<HCaptchaApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadHCaptchaScript called outside a browser"));
  }
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<HCaptchaApi>((resolve, reject) => {
    const existing = document.getElementById(HCAPTCHA_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.hcaptcha) resolve(window.hcaptcha);
        else reject(new Error("hCaptcha script loaded but window.hcaptcha is undefined"));
      });
      existing.addEventListener("error", () => reject(new Error("hCaptcha script failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.id = HCAPTCHA_SCRIPT_ID;
    script.src = HCAPTCHA_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      if (window.hcaptcha) resolve(window.hcaptcha);
      else reject(new Error("hCaptcha script loaded but window.hcaptcha is undefined"));
    });
    script.addEventListener("error", () => reject(new Error("hCaptcha script failed to load")));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface RenderHCaptchaOptions {
  /** The DOM node the widget renders into. Replaces its children. */
  container: HTMLElement;
  /** Override the sitekey (defaults to MoonPay's production sitekey). */
  sitekey?: string;
  theme?: "light" | "dark";
  size?: "normal" | "compact" | "invisible";
  /** Called when the user gives up or the widget errors. */
  onError?: (err: unknown) => void;
}

export interface HCaptchaHandle {
  /** Resolves with the captcha token once the user completes the challenge. */
  token: Promise<string>;
  /** Reset the widget (clears the previous token; user must solve again). */
  reset(): void;
  /** Tear the widget down. Safe to call after `token` resolves. */
  destroy(): void;
}

/**
 * Render an hCaptcha widget bound to MoonPay's production sitekey.
 * Returns a {@link HCaptchaHandle} whose `token` promise resolves once
 * the user completes the challenge.
 *
 * Reset and re-await `token` if the widget expires before you submit.
 */
export async function renderMoonPayHCaptcha(
  options: RenderHCaptchaOptions,
): Promise<HCaptchaHandle> {
  const api = await loadHCaptchaScript();
  let resolveToken!: (token: string) => void;
  let rejectToken!: (err: unknown) => void;
  const tokenPromise = new Promise<string>((res, rej) => {
    resolveToken = res;
    rejectToken = rej;
  });

  const widgetId = api.render(options.container, {
    sitekey: options.sitekey ?? MOONPAY_HCAPTCHA_SITEKEY,
    theme: options.theme ?? MOONPAY_HCAPTCHA_CONFIG.theme,
    size: options.size ?? MOONPAY_HCAPTCHA_CONFIG.size,
    callback: (token) => resolveToken(token),
    "expired-callback": () => {
      const err = new Error("hCaptcha token expired before submission");
      options.onError?.(err);
    },
    "error-callback": (err) => {
      options.onError?.(err);
      rejectToken(err);
    },
  });

  return {
    token: tokenPromise,
    reset: () => api.reset(widgetId),
    destroy: () => api.remove(widgetId),
  };
}

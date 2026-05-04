/**
 * Agent-driven Dextercard provisioning.
 *
 * Two MCP tools that let an agent walk a user through provisioning a
 * Dextercard session entirely through the conversation, no terminal
 * commands required:
 *
 *   card_login_start   →  Hand the agent a MoonPay login URL the user
 *                         opens in a browser. They solve the carrier's
 *                         hCaptcha there (we can't solve captchas from
 *                         an MCP tool, by carrier policy) and click
 *                         Continue. MoonPay sends an OTP email. No
 *                         server-side state — this tool is just a URL
 *                         template + instructions.
 *
 *   card_login_complete →  Agent receives the OTP code from the user
 *                         (after they read it from email) and calls
 *                         this tool with {email, code}. We hit the
 *                         carrier's /verify endpoint (no captcha
 *                         required at this stage) and persist the
 *                         returned SessionTokens to the same encrypted
 *                         store auto-pairing and `dextercard login`
 *                         use. Subsequent card_status / card_issue
 *                         calls then resume normally.
 *
 * This closes the bootstrap gap: combined with the auto-pairing flow
 * that landed in 1.10.0, an agent can now take a brand-new user from
 * "I want a Dextercard" to "card issued" entirely through MCP tool
 * calls + two browser tabs the user opens (one for dexter.cash sign-in,
 * one for MoonPay captcha) and one OTP code paste.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { verify } from "@dexterai/dextercard";
import type { NpmCardsAdapter } from "../cards-adapter.js";

export interface CardLoginToolOpts {
  cards: NpmCardsAdapter;
}

export function registerCardLoginTools(server: McpServer, opts: CardLoginToolOpts): void {
  server.tool(
    "card_login_start",
    "Begin agent-driven Dextercard provisioning. Returns a MoonPay login URL the user must open in their browser. " +
      "They solve the carrier's hCaptcha there (we cannot solve captchas from MCP — carrier policy), click Continue, and the carrier emails them a one-time code. " +
      "Once the user reads the code from their email, the agent calls `card_login_complete` with {email, code} to finish. " +
      "Use this tool ONLY when card_status returns `no_dextercard_session` after a successful pairing — i.e., the user has signed in to dexter.cash but has never provisioned a carrier session. For users who already have a session, the auto-pairing flow handles everything.",
    {
      email: z
        .string()
        .email()
        .describe(
          "User's email address. The carrier sends the OTP here. Pre-filled into the login URL so they don't have to retype it.",
        ),
    },
    async (args) => {
      const loginUrl = `https://agents.moonpay.com/login?email=${encodeURIComponent(args.email)}`;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                stage: "awaiting_otp",
                loginUrl,
                email: args.email,
                instructions: [
                  `Open ${loginUrl} in your browser`,
                  "Solve the captcha on that page and click Continue",
                  "Check your email for a one-time code",
                  "Tell the agent the code you received — it will call card_login_complete with {email, code} to finish",
                ],
                nextAction: "user_open_url_then_call_card_login_complete_with_code",
              },
              null,
              2,
            ),
          },
        ],
        structuredContent: {
          stage: "awaiting_otp" as const,
          loginUrl,
          email: args.email,
        },
      } as any;
    },
  );

  server.tool(
    "card_login_complete",
    "Finish agent-driven Dextercard provisioning by exchanging an OTP code for a carrier session. " +
      "Call this AFTER `card_login_start` and AFTER the user has solved the captcha and received their OTP. " +
      "On success, the carrier session is persisted to the same encrypted store the auto-pairing flow uses, " +
      "so the next `card_status` call returns the user's actual card state and `card_issue` can drive onboarding.",
    {
      email: z
        .string()
        .email()
        .describe(
          "Same email passed to card_login_start. Required by the carrier to scope the OTP exchange.",
        ),
      code: z
        .string()
        .regex(/^\d{4,8}$/, "Expected 4-8 digit OTP code")
        .describe("One-time code from the email the carrier sent."),
    },
    async (args) => {
      try {
        const tokens = await verify({
          email: args.email.trim(),
          code: args.code.trim(),
        });
        opts.cards.saveSession(tokens);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  stage: "session_ready",
                  email: args.email,
                  nextAction: "call_card_status_to_inspect_state_then_call_card_issue_to_provision_card",
                },
                null,
                2,
              ),
            },
          ],
          structuredContent: {
            stage: "session_ready" as const,
            email: args.email,
          },
        } as any;
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  stage: "verification_failed",
                  error: err?.message || String(err),
                  hint: "Common causes: code expired (>10 min old), code mistyped, email mismatch, OTP already consumed by a previous call. Have the user request a fresh code via card_login_start.",
                },
                null,
                2,
              ),
            },
          ],
          structuredContent: {
            stage: "verification_failed" as const,
            error: err?.message || String(err),
          },
          isError: true,
        } as any;
      }
    },
  );
}

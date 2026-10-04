"use client";
import { useEffect, useState } from "react";
import { Shield, Bell, X } from "lucide-react";

/*
  A NOTICE, NOT A CONSENT GATE — AND IT NO LONGER COLLECTS A CONSENT IT WAS
  NEVER ENTITLED TO.

  ============================================================================
  WHAT THIS SAID BEFORE
  ============================================================================

      "We use essential cookies for sign-in and to remember your preferences.
       By continuing you agree to our use of cookies AND TO BE CONTACTED ABOUT
       YOUR INQUIRIES."

  with exactly one button, "Accept & continue", and no way to decline or
  dismiss. Two separate problems in one sentence.

  1. IT BUNDLED MARKETING CONSENT INTO A COOKIE BAR. Permission to email or
     call someone is a different thing from permission to set a session
     cookie, and it was being taken by the act of not leaving the page.
     Under the DPDP Act consent has to be free, specific, informed and
     unambiguous, and the person has to be able to refuse. "By continuing you
     agree" is none of those. Worse, it is simply untrue as a statement of
     fact: the user agreed to nothing, and the banner then recorded that they
     had.

     Contact consent belongs on the form where somebody actually asks to be
     contacted — /contact, the access request, the health-check lead form —
     next to the thing they are submitting. Not here.

  2. IT ASKED FOR CONSENT IT DOES NOT NEED. Checked before rewriting: this app
     sets no advertising or analytics cookies. The only cookies are the
     Supabase auth session, the `cortex_org` active-workspace cookie and the
     referral code — all first-party and all strictly necessary to deliver a
     thing the user asked for. There is no third-party tracker anywhere in
     src/ or public/ (the one "Mixpanel" string in the codebase is an entry in
     the integrations catalogue, i.e. somewhere a CUSTOMER may store their own
     key — not something we load). Funnel analytics is first-party,
     server-side and explicitly cookieless; lib/funnel.ts says so in its own
     header: "No raw IP, no user agent, no cookie, no query string."

     Strictly necessary cookies do not require consent. Asking for it anyway
     trains people to click through consent dialogs, and it implies there is
     something to opt out of when there is not.

  So this is now what it should always have been: a short factual notice with
  a dismiss, and a link to the policy for anyone who wants the detail. The
  notification button stays — that is a real browser permission prompt the
  person grants deliberately, and it is optional.

  localStorage key is unchanged, so anyone who already dismissed the old
  banner is not shown this one again.
*/
export function ConsentBanner() {
  const [show, setShow] = useState(false);
  const [notif, setNotif] = useState<string>("default");
  useEffect(() => {
    if (!localStorage.getItem("mnb-consent")) setShow(true);
    if (typeof Notification !== "undefined") setNotif(Notification.permission);
  }, []);
  function dismiss() { localStorage.setItem("mnb-consent", new Date().toISOString()); setShow(false); }
  async function enableNotifs() { try { if (typeof Notification !== "undefined") { const p = await Notification.requestPermission(); setNotif(p); } } catch {} }
  if (!show) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-[70] p-3 no-print">
      <div className="max-w-3xl mx-auto rounded-xl border bg-card shadow-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Shield className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
        <p className="text-sm text-muted-foreground flex-1">
          Cortex uses only the cookies it needs to sign you in and remember which workspace
          you are in. No advertising or third-party tracking cookies.{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            How we handle your data
          </a>
          .
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {notif !== "granted" && (
            <button
              onClick={enableNotifs}
              className="inline-flex items-center gap-1.5 rounded-lg border h-9 px-3 text-sm hover:bg-accent"
            >
              <Bell className="h-4 w-4" aria-hidden="true" /> Notifications
            </button>
          )}
          <button
            onClick={dismiss}
            aria-label="Dismiss this notice"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium"
          >
            <X className="h-4 w-4" aria-hidden="true" /> Got it
          </button>
        </div>
      </div>
    </div>
  );
}

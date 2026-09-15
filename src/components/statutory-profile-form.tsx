import { Card } from "@/components/ui/card";
import { PROFILE_QUESTIONS, type StatutoryProfile } from "@/lib/statutory-profile";
import { updateStatutoryProfile } from "@/lib/actions";
import { SafeForm } from "@/components/safe-form";
import { SubmitButton } from "@/components/form-buttons";

/*
  SIX QUESTIONS THAT TURN INDIA'S CALENDAR INTO THIS BUSINESS'S.

  A server component with a plain <form action={serverAction}> and native
  <select>s — deliberately, not for want of polish:

    - it works with JavaScript disabled and on a bad connection, which is the
      condition a lot of Indian SME users are actually in;
    - there is no optimistic state to get wrong. The answers decide which
      statutory warnings the workspace stops receiving, so "it looked saved"
      is not an acceptable outcome, and a full round trip is the honest
      interaction;
    - `updateStatutoryProfile` reads the row back and REPORTS if nothing was
      written, so a failed save surfaces rather than silently appearing to
      work — the pattern the rest of this codebase had to learn.

  I got the last part half right and had to come back. The action did check
  its row count, but it threw, and a thrown message is masked by Next in
  production and takes the whole page down with it — so a failed save showed a
  support reference instead of the sentence I wrote, and lost the six answers
  on the way. Worse, I saw the real failure mode live: two saves returned 503
  during a deploy and produced NOTHING — no error, no change, a form that
  looked exactly like one that had worked. SafeForm handles both, and the
  plain <button> below is now a SubmitButton so the form is visibly busy
  while it is in flight. See lib/action-result.ts.

  Every question offers "I'm not sure", and that is the default. Choosing it
  is how an answer is UNDONE: an owner who ticked "no employees" and later
  hires needs a route back to seeing the PF deadline. Absent and "unknown"
  behave identically downstream — both show everything.
*/
export function StatutoryProfileForm({ profile }: { profile: StatutoryProfile }) {
  return (
    <SafeForm action={updateStatutoryProfile} successMessage="Saved. Your calendar below now reflects these answers.">
      <div className="grid md:grid-cols-2 gap-4">
        {PROFILE_QUESTIONS.map((q) => (
          <Card key={q.key} className="p-4">
            <label htmlFor={`sp-${q.key}`} className="block text-sm font-medium">{q.question}</label>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{q.help}</p>
            <select
              id={`sp-${q.key}`}
              name={q.key}
              defaultValue={profile[q.key]}
              className="mt-3 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Card>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton
          pendingLabel="Saving…"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground min-h-11 px-5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          Save my compliance profile
        </SubmitButton>
        <p className="text-xs text-muted-foreground max-w-xl">
          These are your answers, not our assessment. Anything you leave as &ldquo;I&rsquo;m not sure&rdquo; keeps showing,
          so nothing disappears because you skipped a question. Change them any time — your CA is the right person to ask
          about the audit one.
        </p>
      </div>
    </SafeForm>
  );
}

// Placeholder, deliberately not a working feature. CLAUDE.md's own scope
// section is explicit: "There is no server, no UI, no upload, and no live
// production service that picks a template per end-user request at
// runtime. Do not build that." A real "upload a PDF, we register it live"
// feature would be exactly that - and it would also just re-implement the
// CLI's own `init` workflow, which deliberately requires a human to
// hand-author schema.ts/mapping.ts afterward (see CLAUDE.md's "Workflow:
// adding a form"), not something safe to fully automate.
//
// A future, safer version of this page: an in-browser preview/inspect tool
// - drag in a candidate PDF and see its field dump / gate-graph analysis
// entirely client-side, reusing genericFields.ts/gateGraph.ts unmodified,
// exactly like the rest of this UI already does. That's assistive (helps a
// developer decide whether a form is worth registering, and spot gating
// conventions up front) rather than automatic - actually committing a new
// form to the repo would still need either the real CLI or, longer term, a
// dedicated human-reviewed registration step. Not built here.
export default function RegisterFormPage() {
  return (
    <div class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
      <h2 class="text-lg font-semibold text-slate-800">Register new form</h2>
      <p class="text-sm text-slate-600">
        Not a live feature in this demo. Registering a new form is a developer-time workflow, run once per form and
        reviewed by a human before it's usable - not something an end user triggers at runtime.
      </p>
      <div class="rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700">
        <p>bun run scripts/cli.ts init &lt;id&gt; &lt;pdf-path&gt;</p>
        <p>bun run scripts/cli.ts inspect &lt;id&gt;</p>
        <p class="text-slate-400"># then hand-author schema.ts / mapping.ts</p>
      </div>
      <p class="text-sm text-slate-500">
        A future version of this page could let a developer drag in a candidate PDF and preview its field dump and
        gate-graph analysis right here in the browser - the same generic, Bun-free layer (
        <code class="rounded bg-slate-100 px-1">genericFields.ts</code>/<code class="rounded bg-slate-100 px-1">gateGraph.ts</code>
        ) this UI already runs unmodified. Actually registering the form would still need a human-reviewed step, not
        automatic runtime dispatch.
      </p>
    </div>
  );
}

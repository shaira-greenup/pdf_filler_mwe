// Placeholder for now - the form picker, fill flow, and gate-warning panel
// land in a later step. This just proves the Vite + Solid + Tailwind shell
// renders end to end - the extra styling here is only to make Tailwind's
// output visually unmistakable (card, shadow, color, hover state), not a
// preview of the real UI.
export default function App() {
  return (
    <main class="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div class="max-w-sm w-full rounded-xl border border-slate-200 bg-white p-8 shadow-lg space-y-4">
        <h1 class="text-2xl font-semibold text-slate-800">PDF Form Filler</h1>
        <p class="text-sm text-slate-500">
          Tailwind is wired up - this card's border, shadow, gradient
          background, and the button below all come from utility classes.
        </p>
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Looks right
        </button>
      </div>
    </main>
  );
}

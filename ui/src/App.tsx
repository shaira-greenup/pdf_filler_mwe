import { createSignal, Show } from "solid-js";
import RegisterFormPage from "./pages/RegisterFormPage";
import AutomateFillPage from "./pages/AutomateFillPage";

type Page = "register" | "automate";

const navButtonClass = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`;

export default function App() {
  const [page, setPage] = createSignal<Page>("automate");

  return (
    <main class="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <div class="mx-auto max-w-xl space-y-6">
        <header class="space-y-3">
          <div>
            <h1 class="text-2xl font-semibold text-slate-800">PDF Form Filler</h1>
            <p class="text-sm text-slate-500">Runs entirely in your browser - nothing here is sent anywhere.</p>
          </div>
          <nav class="flex gap-2">
            <button type="button" onClick={() => setPage("register")} class={navButtonClass(page() === "register")}>
              Register new form
            </button>
            <button type="button" onClick={() => setPage("automate")} class={navButtonClass(page() === "automate")}>
              Automate filling out form
            </button>
          </nav>
        </header>

        <Show when={page() === "register"}>
          <RegisterFormPage />
        </Show>
        <Show when={page() === "automate"}>
          <AutomateFillPage />
        </Show>
      </div>
    </main>
  );
}

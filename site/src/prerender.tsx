import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";

/** The Persian landing as HTML, for index.html at build time. */
export function render(): string {
  return renderToString(<App initialLang="fa" initialRoute={{ name: "", params: new URLSearchParams() }} />);
}

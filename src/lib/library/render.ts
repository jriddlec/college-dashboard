import "server-only";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import java from "highlight.js/lib/languages/java";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import cpp from "highlight.js/lib/languages/cpp";

hljs.registerLanguage("java", java);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("cpp", cpp);

const LANG: Record<string, string> = { java: "java", xml: "xml", json: "json", py: "python", js: "javascript", ts: "javascript", sh: "bash", sql: "sql", c: "cpp", h: "cpp", cpp: "cpp" };

export function isCode(ext: string): boolean {
  return ext in LANG;
}

/** Highlighted HTML for a source file (highlight.js escapes the input). */
export function highlight(src: string, ext: string): string {
  return hljs.highlight(src, { language: LANG[ext] ?? "plaintext", ignoreIllegals: true }).value;
}

/** Markdown → HTML. The library only holds your own notes, so embedded HTML is kept. */
export function markdown(src: string): string {
  return marked.parse(src, { gfm: true, async: false });
}

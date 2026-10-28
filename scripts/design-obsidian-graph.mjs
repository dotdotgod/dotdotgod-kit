import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Editable visual proposal, not a screenshot or proof of native graph support.
const output = resolve(import.meta.dirname, "../design/obsidian-graph");
await mkdir(output, { recursive: true });
const commands = [];
function node(type, name, x, y, width, height, props = {}, text) {
  commands.push({ command: "node.create", params: { type, name, x, y, width, height, props, ...(text ? { text } : {}) } });
}
function rect(name, x, y, w, h, fill, radius = 0) {
  node("rectangle", name, x, y, w, h, { fill, cornerRadius: radius });
}
function text(value, x, y, size = 14, fill = "#D8DEE9") {
  const technical = /\.(md|ts)\b|implemented_by|verified_by|design_decision|related_doc|implementedBy:/.test(value);
  node("text", value, x, y, Math.min(1440 - x - 12, value.length * size * 0.65 + 10), size * 1.6, { fill, fontSize: size, fontFamily: technical ? "Menlo" : "Helvetica Neue" }, value);
}
function edge(name, x1, y1, x2, y2, color, weight, label, lx, ly) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const tipX = x2 - ux * 11;
  const tipY = y2 - uy * 11;
  const baseX = tipX - ux * 11;
  const baseY = tipY - uy * 11;
  commands.push({ command: "vector.create", params: {
    path: `M ${x1} ${y1} L ${tipX} ${tipY}`, props: { fill: "none", stroke: color, strokeWeight: weight },
  } });
  commands.push({ command: "vector.create", params: {
    path: `M ${baseX - uy * 5} ${baseY + ux * 5} L ${tipX} ${tipY} L ${baseX + uy * 5} ${baseY - ux * 5} Z`,
    props: { fill: color, stroke: "none" },
  } });
  // Relationship names belong in the fixed legend, never on the graph edges.
}
function dot(name, x, y, color, selected = false) {
  if (selected) node("ellipse", `${name} selection`, x - 15, y - 15, 30, 30, { fill: "#292B42", stroke: "#B9A3FF", strokeWeight: 2 });
  node("ellipse", name, x - 7, y - 7, 14, 14, { fill: color });
  text(name, x - 65, y + 20, 13);
}

node("frame", "Traceability — dark / visual proposal", 0, 0, 1440, 900, { fill: "#1B1D24" });
rect("Ribbon", 0, 0, 48, 900, "#14161B");
rect("Files", 48, 0, 224, 900, "#181A20");
rect("Tab bar", 272, 0, 1168, 48, "#181A20");
rect("Inspector", 1120, 48, 320, 852, "#20222B");
rect("Ribbon graph stem", 23, 24, 1, 23, "#B9A3FF");
for (const [x, y] of [[24, 24], [16, 44], [32, 44]]) node("ellipse", "Graph icon point", x - 3, y - 3, 6, 6, { fill: "#B9A3FF" });
text("PROJECT FILES", 68, 24, 11, "#929AAE");
text("dotdotgod", 68, 66, 17);
for (const [i, label] of ["▾ docs", "    ▾ spec", "        AUTH.md", "    ▾ arch", "        AUTH_DESIGN.md", "▾ src", "    auth.ts", "▾ test", "    auth.test.ts"].entries()) text(label, 68, 112 + i * 31, 13, i === 2 ? "#B9A3FF" : "#AAB2C2");
text("Traceability", 298, 15, 14);
text("Relationship", 1144, 80, 19);
text("implemented_by", 1144, 120, 15, "#D8CAFF");
rect("Inspector divider", 1144, 160, 272, 1, "#373B48");
for (const [label, value, y] of [["From", "docs/spec/AUTH.md", 188], ["To", "src/auth.ts", 260], ["Weight", "4", 332]]) {
  text(label, 1144, y, 12, "#AAB2C2");
  text(value, 1144, y + 25, 13);
}
rect("Evidence divider", 1144, 404, 272, 1, "#373B48");
text("Evidence", 1144, 428, 15);
text("implementedBy: src/auth.ts", 1144, 462, 12);
// Labels sit outside the edge segments; no opaque boxes interrupt continuity.
edge("design", 470, 365, 805, 345, "#527F9C", 3, "design_decision", 593, 324);
edge("implementation", 470, 365, 663, 545, "#C8B5FF", 5, "implemented_by", 397, 468);
edge("verification", 470, 365, 881, 630, "#508E76", 5, "verified_by", 778, 528);
edge("related", 805, 345, 663, 545, "#998353", 2, "related_doc", 760, 443);
dot("AUTH.md", 470, 365, "#B9A3FF", true);
dot("AUTH_DESIGN.md", 805, 345, "#72B9E6");
dot("auth.ts", 663, 545, "#D8DEE9");
dot("auth.test.ts", 881, 630, "#70C9A2");
rect("Legend divider", 302, 154, 788, 1, "#373B48");
text("Relationships", 320, 78, 12, "#AAB2C2");
for (const [label, x, color] of [["Implementation", 320, "#C8B5FF"], ["Verification", 485, "#508E76"], ["Design", 630, "#527F9C"], ["Related", 745, "#998353"]]) {
  node("ellipse", `${label} legend`, x, 113, 8, 8, { fill: color });
  text(label, x + 15, 107, 12);
}
text("WEIGHT", 320, 827, 10, "#929AAE");
for (const [weight, x, thickness] of [[1, 415, 1], [3, 560, 3], [4, 705, 5]]) {
  rect(`Weight ${weight} sample`, x, 835 - thickness / 2, 54, thickness, "#AAB2C2");
  text(String(weight), x + 65, 826, 11, "#929AAE");
}
const script = resolve(output, "GRAPH_STYLE.commands.json");
await writeFile(script, JSON.stringify(commands, null, 2) + "\n");
const cli = process.env.FIGCRAFT_CLI ?? resolve(process.env.HOME, ".local/bin/figcraft-cli");
execFileSync(cli, ["run", script, "--out", resolve(output, "GRAPH_STYLE.figcraft")], { stdio: "inherit" });
execFileSync(cli, ["render", resolve(output, "GRAPH_STYLE.figcraft"), "-o", resolve(output, "GRAPH_STYLE.png")], { stdio: "inherit" });

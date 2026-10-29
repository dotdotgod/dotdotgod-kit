// The dependency ships TypeScript sources but no public declaration entrypoint.
// Keep its implementation outside this package's strict compilation boundary.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function registerSubagents(api: ExtensionAPI): void | Promise<void>;

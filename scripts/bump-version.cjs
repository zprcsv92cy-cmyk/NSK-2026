// Körs av GitHub Actions efter en ändring på main.
// Uppdaterar versionsreferenser i samma commit så att alla filer hör ihop.
const fs = require("node:fs");
const path = require("node:path");
const current = fs.readFileSync("version.js", "utf8");
const found = current.match(/NSK_VERSION\s*=\s*["'](\d+)["']/);
if (!found) throw new Error("Kunde inte läsa versionsnummer ur version.js");
const oldVersion = found[1];
const override = process.env.NSK_TARGET_VERSION;
if (override !== undefined && !/^[1-9]\d*$/.test(override)) throw new Error("Ogiltig målversion");
const nextVersion = override === undefined ? String(Number(oldVersion) + 1) : override;
if (Number(nextVersion) <= Number(oldVersion)) throw new Error("Målversion måste vara högre än aktuell version");
if (!Number.isSafeInteger(Number(nextVersion))) throw new Error("Ogiltigt versionsnummer");
const write = (file, value) => fs.writeFileSync(file, value, "utf8");
write("version.js", 'window.NSK_VERSION = "' + nextVersion + '";\n');
const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
manifest.version = nextVersion;
manifest.start_url = manifest.start_url.replace(/([?&]v=)\d+/, "$1" + nextVersion);
write("manifest.webmanifest", JSON.stringify(manifest, null, 2) + "\n");
const deploy = JSON.parse(fs.readFileSync("deploy.json", "utf8"));
deploy.version = nextVersion;
write("deploy.json", JSON.stringify(deploy, null, 2) + "\n");
let sw = fs.readFileSync("sw.js", "utf8");
sw = sw.replace(/nsk-team18-v\d+/g, "nsk-team18-v" + nextVersion);
sw = sw.replace(/([?&]v=)\d+/g, "$1" + nextVersion);
sw = sw.replace(/(NSK-2026 v)\d+/, "$1" + nextVersion);
write("sw.js", sw);
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(filename);
    else if (entry.name.endsWith(".html")) {
      const html = fs.readFileSync(filename, "utf8");
      const updated = html.replace(/(version\.js\?v=)\d+/g, "$1" + nextVersion);
      if (html !== updated) write(filename, updated);
    }
  }
}
visit(".");
console.log("NSK-2026 version " + oldVersion + " -> " + nextVersion);

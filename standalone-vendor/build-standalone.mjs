import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = "X:/ComfyUI_windows_portable/ComfyUI/output/_tools";
const sourcePath = path.join(root, "Wildcard.html");
const outputPath = path.join(root, "Prompt-Loom-Standalone.html");

let html = await readFile(sourcePath, "utf8");
const [tailwind, sortable, chart, dataCsv, danbooruCsv] = await Promise.all([
  readFile(path.join(root, "standalone-vendor/tailwind.js"), "utf8"),
  readFile(path.join(root, "standalone-vendor/sortable.js"), "utf8"),
  readFile(path.join(root, "standalone-vendor/chart.js"), "utf8"),
  readFile(path.join(root, "wildcards/data.csv"), "utf8"),
  readFile("C:/Users/Gaia/Downloads/danbooru_tagsw.csv", "utf8"),
]);

function embeddedScript(source, label) {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return `<script>/* Embedded ${label} */\n(0,eval)(atob("${encoded}"));\n</script>`;
}

html = html
  .replace('<script src="https://cdn.tailwindcss.com"></script>', embeddedScript(tailwind, "Tailwind runtime"))
  .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js"></script>', embeddedScript(sortable, "SortableJS"))
  .replace('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>', embeddedScript(chart, "Chart.js"))
  .replace("<title>WILDCARD — Weighted Prompt Composer</title>", "<title>Prompt Loom — 單一 HTML 離線版</title>")
  .replace('<span class="brand-name block">WILDCARD</span><span class="brand-subtitle block">Weighted prompt composer</span>', '<span class="brand-name block">PROMPT LOOM</span><span class="brand-subtitle block">Standalone weighted prompt composer</span>');

const embeddedSources = JSON.stringify([
  { name: "embedded:data.csv", content: dataCsv },
  { name: "embedded:danbooru_tagsw.csv", content: danbooruCsv },
]);

const replacement = `        const EMBEDDED_CSV_SOURCES = ${embeddedSources};

        async function loadRemoteCSVFiles() {
            const originalText = loadingText.innerText;
            loadingOverlay.classList.add('active');
            loadingText.innerText = "正在載入 HTML 內建 Tag 資料...";
            try {
                const allEmbeddedTags = EMBEDDED_CSV_SOURCES.flatMap(source =>
                    parseCSVContent(source.content, source.name).tags
                );
                const sourceTags = allEmbeddedTags.length > 0
                    ? allEmbeddedTags
                    : rawTagData.map(([t, cat, c, a]) => normalizeTagRecord({ t, cat, c, a }));
                const tagMap = new Map();
                tagDB.forEach(tag => tagMap.set(tag.t, tag));
                sourceTags.forEach(tag => tagMap.set(tag.t, tag));
                tagDB = Array.from(tagMap.values()).sort((a, b) => b.c - a.c);
                await replaceTagsInDB(tagDB);
                localStorage.setItem(TAGS_INITIALIZED_KEY, 'true');
                localStorage.setItem(TAGS_NORMALIZED_KEY, 'true');
                updateTagCountDisplay();
                clearDbBtn.classList.remove('hidden');
                clearDbBtn.innerText = \`還原預設 (\${formatCount(tagDB.length)})\`;
            } catch (error) {
                console.error("Error processing embedded CSV data:", error);
                showToast("內建 Tag 資料載入失敗，已改用精簡後備資料。", "warning");
            } finally {
                loadingOverlay.classList.remove('active');
                loadingText.innerText = originalText;
            }
        }

        async function init()`;

const functionPattern = /        async function loadRemoteCSVFiles\(\) \{[\s\S]*?        async function init\(\)/;
if (!functionPattern.test(html)) throw new Error("Could not locate loadRemoteCSVFiles() in source HTML.");
html = html.replace(functionPattern, replacement);

html = html.replace(
  "</body>",
  `<div style="position:fixed;right:12px;bottom:10px;z-index:20;font:10px monospace;color:#71717a;pointer-events:none">Standalone · 本檔案內含程式與預設 Tags</div>\n</body>`,
);

await writeFile(outputPath, html, "utf8");
console.log(outputPath);

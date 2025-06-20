const fs = require("fs");
const path = require("path");

const DIRECTORY = "./"; // Root directory
const FILE_EXTENSIONS = [".tsx", ".jsx"];

// Replace &apos; with regular apostrophes only in JSX text content
function restoreApostrophesInFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");

  // Revert `&apos;` to `'`
  const restoredContent = content.replace(/&apos;/g, "'");

  if (content !== restoredContent) {
    fs.writeFileSync(filePath, restoredContent, "utf8");
    console.log(`♻️  Restored apostrophes in: ${filePath}`);
  }
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (
      entry.isDirectory() &&
      !["node_modules", ".git", ".next", "out"].includes(entry.name)
    ) {
      walkDir(fullPath);
    } else if (
      entry.isFile() &&
      FILE_EXTENSIONS.includes(path.extname(entry.name))
    ) {
      restoreApostrophesInFile(fullPath);
    }
  }
}

walkDir(DIRECTORY);
console.log("✅ Revert complete: &apos; → '");

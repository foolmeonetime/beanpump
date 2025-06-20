const fs = require("fs");
const path = require("path");

const DIRECTORY = "./"; // Root of your project
const FILE_EXTENSIONS = [".tsx", ".jsx"];

// Replace ' in JSX text nodes only (not inside props, JS logic, etc.)
function fixApostrophesInFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");

  // Match JSX content like <p>Don't</p> and replace apostrophes with &apos;
  const fixedContent = content.replace(
    />([^<]*?)'([^<]*?)</g,
    (_, before, after) => `>${before}&apos;${after}<`
  );

  if (content !== fixedContent) {
    fs.writeFileSync(filePath, fixedContent, "utf8");
    console.log(`✅ Fixed apostrophes in: ${filePath}`);
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
      fixApostrophesInFile(fullPath);
    }
  }
}

walkDir(DIRECTORY);
console.log("✨ All apostrophes safely replaced with &apos;");

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'src');
const iconPath = path.join(root, 'components', 'AppIcon.js');
const importRegex = /import\s+MaterialIcons\s+from\s+['\"][^'\"]*['\"];/g;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!fullPath.endsWith('.js')) {
      continue;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    if (!importRegex.test(content)) {
      importRegex.lastIndex = 0;
      continue;
    }

    importRegex.lastIndex = 0;
    const relative = path.relative(path.dirname(fullPath), iconPath).replace(/\\/g, '/');
    const specifier = relative.startsWith('.') ? relative : `./${relative}`;
    const replacement = `import MaterialIcons from '${specifier}';`;
    content = content.replace(importRegex, replacement);
    fs.writeFileSync(fullPath, content);
    console.log(`updated ${path.relative(path.resolve(__dirname, '..'), fullPath)}`);
  }
}

walk(root);

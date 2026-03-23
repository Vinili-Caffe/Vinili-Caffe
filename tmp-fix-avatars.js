const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules')) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./Vinyls');
let affected = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let orig = content;
  
  content = content.replace(/\btargetUser(\?)?\.displayAvatarURL/g, '(typeof targetMember !== "undefined" && targetMember ? targetMember : targetUser)$1.displayAvatarURL');
  content = content.replace(/\bmodUser(\?)?\.displayAvatarURL/g, '(typeof modMember !== "undefined" && modMember ? modMember : modUser)$1.displayAvatarURL');
  content = content.replace(/member\?\.user\?\.displayAvatarURL/g, 'member?.displayAvatarURL');
  
  if (content !== orig) {
    fs.writeFileSync(file, content, 'utf8');
    affected++;
  }
}
console.log('Modified', affected, 'further files');

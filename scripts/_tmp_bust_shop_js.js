const fs = require("fs");
const src = "/tmp/shop-index.html";
const dest = "/var/www/viniliecaffe/evento/shop/index.html";
let t = fs.readFileSync(src, "utf8");
t = t.replace(/hogwarts-shop-page\.js(?:\?v=[^"]*)?/g, "hogwarts-shop-page.js?v=20260815boost1");
fs.writeFileSync(dest, t);
console.log(
  t
    .split("\n")
    .filter((l) => l.includes("hogwarts-shop-page"))
    .join("\n"),
);

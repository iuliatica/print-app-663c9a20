const fs = require("fs");
const path = "src/app/page.tsx";
let s = fs.readFileSync(path, "utf8");
// Fix: replace curly/smart quotes that can confuse JSX parser around "anterior"
// U+201C left double quote, U+201D right double quote, U+201E double low-9
s = s.replace(/anterior(.)\s+pentru/g, (_, q) => "anterior» pentru");
fs.writeFileSync(path, s);
console.log("Done");

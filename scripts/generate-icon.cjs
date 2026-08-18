const { default: pngToIco } = require("png-to-ico");
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "assets", "icon.png");
const dest = path.join(__dirname, "..", "assets", "icon.ico");

pngToIco(src)
  .then((buf) => {
    fs.writeFileSync(dest, buf);
    console.log("icon.ico gerado com sucesso.");
  })
  .catch((err) => {
    console.error("Falha ao gerar icon.ico:", err);
    process.exit(1);
  });

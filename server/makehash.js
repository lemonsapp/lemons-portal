const bcrypt = require("bcryptjs");

(async () => {
  const hash = await bcrypt.hash("demo1234", 10);
  console.log(hash);
})();
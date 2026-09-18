const store = require("./data/store");
const { createApp } = require("./app");
const { PORT, HOST } = require("./config");

const app = createApp();

if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, HOST, () => {
    store.readDb().catch((err) => console.error(err));
    console.log(`CCST Ticketing ready at http://${HOST}:${PORT}`);
    console.log("Instructors: create a class from the sign-in page, then add students under Team.");
  });
}

module.exports = app;

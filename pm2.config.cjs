module.exports = {
  apps: [
    {
      name: "rusutsu",
      script:
        "export `cat .env` && PORT=3000 ~/.volta/bin/node .next/standalone/server.js ",
    },
  ],
};

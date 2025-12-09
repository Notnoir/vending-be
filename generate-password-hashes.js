const bcrypt = require("bcryptjs");

async function generateHashes() {
  console.log("Generating password hashes for sample users...\n");

  const users = [
    { email: "admin@medivend.com", password: "admin123", role: "admin" },
    { email: "buyer1@example.com", password: "buyer123", role: "buyer" },
    { email: "buyer2@example.com", password: "buyer123", role: "buyer" },
    { email: "guest@example.com", password: "guest123", role: "guest" },
  ];

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    console.log(
      `-- ${user.role.toUpperCase()}: ${user.email} / ${user.password}`
    );
    console.log(
      `UPDATE users SET password_hash = '${hash}' WHERE email = '${user.email}';`
    );
    console.log("");
  }
}

generateHashes().catch(console.error);

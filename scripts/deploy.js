const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Forum contract with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy the Forum contract
  const Forum = await ethers.getContractFactory("Forum");
  const forum = await Forum.deploy();
  await forum.waitForDeployment();

  const address = await forum.getAddress();
  console.log("Forum deployed to:", address);

  // Write the contract address to a JSON file for the frontend to consume
  const deploymentInfo = {
    contractAddress: address,
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  const outPath = path.join(__dirname, "../frontend/src/environments/deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info written to:", outPath);
  console.log("\nNext step: update contractAddress in frontend/src/environments/environment.ts");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

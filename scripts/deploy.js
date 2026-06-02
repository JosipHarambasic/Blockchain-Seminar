const { ethers, hre } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Forum contract with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy the Forum contract (no constructor arguments).
  const Forum = await ethers.getContractFactory("Forum");
  const forum = await Forum.deploy();
  await forum.waitForDeployment();

  const address = await forum.getAddress();
  console.log("Forum deployed to:", address);

  // ── Write ABI for subgraph ────────────────────────────────────────────────
  const artifact = await hre.artifacts.readArtifact("Forum");
  const abiOut = path.join(__dirname, "../subgraph/abis/Forum.json");
  fs.mkdirSync(path.dirname(abiOut), { recursive: true });
  fs.writeFileSync(abiOut, JSON.stringify(artifact.abi, null, 2));
  console.log("ABI written to:", abiOut);

  // ── Write deployment info for the frontend ────────────────────────────────
  const deploymentInfo = {
    contractAddress: address,
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
  };

  const envOut = path.join(__dirname, "../frontend/src/environments/deployment.json");
  fs.mkdirSync(path.dirname(envOut), { recursive: true });
  fs.writeFileSync(envOut, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info written to:", envOut);

  console.log("\nNext steps:");
  console.log("  1. Update frontend/src/environments/environment.ts with the address above.");
  console.log("  2. Copy subgraph/abis/Forum.json and update subgraph/subgraph.yaml with the address.");
  console.log("  3. Run: cd subgraph && graph deploy ...");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });


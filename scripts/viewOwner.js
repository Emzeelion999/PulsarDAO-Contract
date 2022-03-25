const { ethers } = require("hardhat");
const hre = require("hardhat");
const contracts = require("./deployed.js");

const net = process.env.HARDHAT_NETWORK;
const vePULAddress = contracts[net].vePUL;

const v = process.argv;

// Example: HARDHAT_NETWORK='pulsarTest' node viewOwner.js 1

const para = {
  nftid: v[2],
};

//mint uniswap v3 nft
async function main() {
  const vePULFactory = await ethers.getContractFactory("vePUL");
  const vePUL = vePULFactory.attach(vePULAddress);
  console.log(await vePUL.ownerOf(para.nftid));
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
